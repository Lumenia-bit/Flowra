export function pythonRuntimeTemplate(): string {
  return String.raw`import json
import mimetypes
import os
import random
import sqlite3
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parent
WORKFLOW = json.loads((ROOT / "workflow.json").read_text(encoding="utf-8"))

def load_env():
    path = ROOT / ".env"
    values = {}
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                key, value = line.split("=", 1)
                values[key.strip()] = value.strip().strip('"').strip("'")
    return values

TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN") or load_env().get("TELEGRAM_BOT_TOKEN")
if not TOKEN:
    raise RuntimeError("Set TELEGRAM_BOT_TOKEN in .env or environment")
API = f"https://api.telegram.org/bot{TOKEN}"
DB = sqlite3.connect(ROOT / "data.sqlite")
DB.row_factory = sqlite3.Row
DB.executescript("""
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_user_id TEXT UNIQUE NOT NULL,
  chat_id TEXT NOT NULL,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  language_code TEXT,
  first_started_at TEXT NOT NULL,
  last_activity_at TEXT NOT NULL,
  message_count INTEGER NOT NULL DEFAULT 0,
  current_node TEXT
);
CREATE TABLE IF NOT EXISTS variables (
  user_id INTEGER NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(user_id, key)
);
CREATE TABLE IF NOT EXISTS sessions (
  user_id INTEGER PRIMARY KEY,
  node_id TEXT NOT NULL,
  input_type TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
""")
DB.commit()

def now():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

def multipart(fields, files):
    boundary = "----flowra" + uuid.uuid4().hex
    parts = []
    for key, value in fields.items():
        if value is None:
            continue
        data = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)
        parts.extend([f"--{boundary}\r\n".encode(), f'Content-Disposition: form-data; name="{key}"\r\n\r\n'.encode(), data.encode(), b"\r\n"])
    for field, path in files:
        path = Path(path)
        mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        parts.extend([
            f"--{boundary}\r\n".encode(),
            f'Content-Disposition: form-data; name="{field}"; filename="{path.name}"\r\n'.encode(),
            f"Content-Type: {mime}\r\n\r\n".encode(), path.read_bytes(), b"\r\n"
        ])
    parts.append(f"--{boundary}--\r\n".encode())
    return b"".join(parts), f"multipart/form-data; boundary={boundary}"

def api(method, payload=None, files=None, timeout=40):
    payload = payload or {}
    files = files or []
    if files:
        body, content_type = multipart(payload, files)
    else:
        body = json.dumps(payload, ensure_ascii=False).encode()
        content_type = "application/json"
    request = urllib.request.Request(f"{API}/{method}", data=body, headers={"Content-Type": content_type})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            result = json.loads(response.read().decode())
    except urllib.error.HTTPError as error:
        result = json.loads(error.read().decode())
    if not result.get("ok"):
        retry = result.get("parameters", {}).get("retry_after")
        if retry:
            time.sleep(retry + 1)
        raise RuntimeError(result.get("description", "Telegram API error"))
    return result.get("result")

def upsert_user(source, chat_id):
    timestamp = now()
    DB.execute("""
      INSERT INTO users (telegram_user_id, chat_id, username, first_name, last_name, language_code, first_started_at, last_activity_at, message_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
      ON CONFLICT(telegram_user_id) DO UPDATE SET
        chat_id=excluded.chat_id, username=excluded.username, first_name=excluded.first_name,
        last_name=excluded.last_name, language_code=excluded.language_code,
        last_activity_at=excluded.last_activity_at, message_count=users.message_count+1
    """, (str(source["id"]), str(chat_id), source.get("username"), source.get("first_name"), source.get("last_name"), source.get("language_code"), timestamp, timestamp))
    DB.commit()
    return DB.execute("SELECT * FROM users WHERE telegram_user_id=?", (str(source["id"]),)).fetchone()

def variables(user_id):
    rows = DB.execute("SELECT key, value FROM variables WHERE user_id=?", (user_id,)).fetchall()
    result = {}
    for row in rows:
        try:
            result[row["key"]] = json.loads(row["value"])
        except json.JSONDecodeError:
            result[row["key"]] = row["value"]
    return result

def set_variable(user_id, key, value):
    DB.execute("""
      INSERT INTO variables (user_id, key, value, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at
    """, (user_id, key, json.dumps(value, ensure_ascii=False), now()))
    DB.commit()

def value_at(path, context):
    if path.startswith("variable."):
        path = path[9:]
    if "." not in path and path in context["variables"]:
        return context["variables"].get(path)
    current = context
    for part in path.split("."):
        if not isinstance(current, dict) or part not in current:
            return None
        current = current[part]
    return current

def resolve(value, context):
    if not isinstance(value, str):
        return value
    if value.startswith("{{") and value.endswith("}}") and value.count("{{") == 1:
        return value_at(value[2:-2].strip(), context)
    output = value
    while "{{" in output and "}}" in output:
        start = output.index("{{")
        end = output.index("}}", start)
        item = value_at(output[start + 2:end].strip(), context)
        if isinstance(item, (dict, list)):
            item = json.dumps(item, ensure_ascii=False)
        output = output[:start] + ("" if item is None else str(item)) + output[end + 2:]
    return output

def next_node(node_id, handle="next"):
    edge = next((item for item in WORKFLOW["edges"] if item["source"] == node_id and item.get("sourceHandle") == handle), None)
    if not edge:
        edge = next((item for item in WORKFLOW["edges"] if item["source"] == node_id and item.get("sourceHandle") in (None, "next")), None)
    if not edge:
        return None
    return next((item for item in WORKFLOW["nodes"] if item["id"] == edge["target"]), None)

def media_value(data, context, field):
    if data.get("source") == "asset":
        path = ROOT / data.get("asset", "")
        if not path.is_file():
            raise RuntimeError(f"Asset not found: {data.get('asset')}")
        return f"attach://{field}", [(field, path)]
    if data.get("source") == "url":
        return str(resolve(data.get("url", ""), context)), []
    return str(resolve(data.get("fileId", ""), context)), []

def condition(left, operator, right):
    if operator == "exists":
        return left not in (None, "")
    if operator == "contains":
        return str(right or "") in str(left or "")
    if operator == "equals":
        return str(left or "") == str(right or "")
    if operator == "notEquals":
        return str(left or "") != str(right or "")
    try:
        a, b = float(left), float(right)
    except (TypeError, ValueError):
        return False
    return {"greater": a > b, "less": a < b, "greaterOrEqual": a >= b, "lessOrEqual": a <= b}.get(operator, False)

def execute(start, context):
    node = start
    last_message_id = None
    for _ in range(100):
        if not node:
            return
        data = node.get("data", {})
        kind = node["type"]
        handle = "next"
        DB.execute("UPDATE users SET current_node=? WHERE id=?", (node["id"], context["db_user_id"]))
        DB.commit()
        print(f"{node['id']} ({kind})", flush=True)
        if kind == "sendMessage":
            payload = {"chat_id": context["chat"]["id"], "text": str(resolve(data.get("text", ""), context))}
            if data.get("parseMode") in ("Markdown", "HTML"):
                payload["parse_mode"] = data["parseMode"]
            last_message_id = api("sendMessage", payload)["message_id"]
        elif kind in ("sendPhoto", "sendVideo", "sendAudio", "sendVoice", "sendDocument"):
            field = kind[4:].lower()
            media, files = media_value(data, context, field)
            payload = {"chat_id": context["chat"]["id"], field: media, "caption": resolve(data.get("caption", ""), context)}
            if data.get("parseMode") in ("Markdown", "HTML"):
                payload["parse_mode"] = data["parseMode"]
            last_message_id = api(kind, payload, files)["message_id"]
        elif kind == "sendLocation":
            result = api("sendLocation", {"chat_id": context["chat"]["id"], "latitude": float(resolve(data.get("latitude"), context)), "longitude": float(resolve(data.get("longitude"), context))})
            last_message_id = result["message_id"]
        elif kind == "sendContact":
            result = api("sendContact", {"chat_id": context["chat"]["id"], "phone_number": str(resolve(data.get("phoneNumber", ""), context)), "first_name": str(resolve(data.get("firstName", ""), context)), "last_name": str(resolve(data.get("lastName", ""), context))})
            last_message_id = result["message_id"]
        elif kind in ("sendPoll", "sendQuiz"):
            payload = {"chat_id": context["chat"]["id"], "question": str(resolve(data.get("question", ""), context)), "options": [str(resolve(item, context)) for item in data.get("answers", [])], "is_anonymous": bool(data.get("anonymous", True))}
            if kind == "sendPoll":
                payload["allows_multiple_answers"] = bool(data.get("multipleAnswers"))
            else:
                payload.update({"type": "quiz", "correct_option_id": max(0, int(data.get("correctAnswer", 1)) - 1), "explanation": str(resolve(data.get("explanation", ""), context))})
            last_message_id = api("sendPoll", payload)["message_id"]
        elif kind == "sendMediaGroup":
            files, media = [], []
            for index, item in enumerate(data.get("items", [])):
                field = f"media_{index}"
                source, parts = media_value(item, context, field)
                files.extend(parts)
                media.append({"type": "video" if item.get("type") == "video" else "photo", "media": source, "caption": resolve(item.get("caption", ""), context)})
            result = api("sendMediaGroup", {"chat_id": context["chat"]["id"], "media": media}, files)
            last_message_id = result[-1]["message_id"]
        elif kind == "editMessage":
            api("editMessageText", {"chat_id": context["chat"]["id"], "message_id": int(resolve(data.get("messageId"), context) or last_message_id), "text": str(resolve(data.get("text", ""), context))})
        elif kind == "deleteMessage":
            api("deleteMessage", {"chat_id": context["chat"]["id"], "message_id": int(resolve(data.get("messageId"), context) or last_message_id)})
        elif kind == "inlineButtons":
            keyboard = []
            for row in data.get("rows", []):
                output = []
                for button in row:
                    item = {"text": str(resolve(button.get("text", ""), context))}
                    if button.get("action") == "url":
                        item["url"] = str(resolve(button.get("value", ""), context))
                    else:
                        item["callback_data"] = ("node:" if button.get("action") == "node" else "") + str(resolve(button.get("value", ""), context))
                    output.append(item)
                keyboard.append(output)
            if last_message_id:
                api("editMessageReplyMarkup", {"chat_id": context["chat"]["id"], "message_id": last_message_id, "reply_markup": {"inline_keyboard": keyboard}})
            else:
                last_message_id = api("sendMessage", {"chat_id": context["chat"]["id"], "text": "Выберите действие", "reply_markup": {"inline_keyboard": keyboard}})["message_id"]
        elif kind == "replyKeyboard":
            keyboard = [[{"text": str(resolve(button.get("text", ""), context)), "request_contact": button.get("action") == "contact", "request_location": button.get("action") == "location"} for button in row] for row in data.get("rows", [])]
            last_message_id = api("sendMessage", {"chat_id": context["chat"]["id"], "text": "Выберите действие", "reply_markup": {"keyboard": keyboard, "resize_keyboard": bool(data.get("resize")), "one_time_keyboard": bool(data.get("oneTime"))}})["message_id"]
        elif kind == "urlButton":
            text = str(resolve(data.get("text", ""), context))
            url = str(resolve(data.get("url", ""), context))
            last_message_id = api("sendMessage", {"chat_id": context["chat"]["id"], "text": text, "reply_markup": {"inline_keyboard": [[{"text": text, "url": url}]]}})["message_id"]
        elif kind in ("variable", "setVariable"):
            key = str(data.get("key", "")).strip()
            item = resolve(data.get("value"), context)
            context["variables"][key] = item
            set_variable(context["db_user_id"], key, item)
        elif kind == "getVariable":
            target = str(data.get("target", "")).strip()
            if target:
                item = value_at(str(data.get("key", "")), context)
                context["variables"][target] = item
                set_variable(context["db_user_id"], target, item)
        elif kind == "condition":
            handle = "true" if condition(value_at(str(data.get("variable", "")), context), data.get("operator"), resolve(data.get("value"), context)) else "false"
        elif kind == "switch":
            current = value_at(str(data.get("variable", "")), context)
            match = next((item for item in data.get("cases", []) if str(resolve(item.get("value"), context)) == str(current)), None)
            handle = match.get("handle") if match else "default"
        elif kind == "random":
            handle = f"branch_{random.randrange(max(1, min(10, int(data.get('branches', 2)))))}"
        elif kind == "delay":
            time.sleep(max(0, min(300, float(data.get("milliseconds", 0)) / 1000)))
        elif kind == "textInput":
            DB.execute("INSERT OR REPLACE INTO sessions (user_id, node_id, input_type, updated_at) VALUES (?, ?, ?, ?)", (context["db_user_id"], node["id"], data.get("inputType", "text"), now()))
            DB.commit()
            return
        elif kind == "httpRequest":
            try:
                url = str(resolve(data.get("url", ""), context))
                parsed = urllib.parse.urlparse(url)
                if parsed.scheme not in ("http", "https"):
                    raise ValueError("Only HTTP and HTTPS are allowed")
                query = {key: str(resolve(item, context)) for key, item in data.get("query", {}).items()}
                if query:
                    url += ("&" if "?" in url else "?") + urllib.parse.urlencode(query)
                body = None if data.get("method", "GET") in ("GET", "DELETE") else str(resolve(data.get("body", ""), context)).encode()
                headers = {key: str(resolve(item, context)) for key, item in data.get("headers", {}).items()}
                request = urllib.request.Request(url, data=body, headers=headers, method=data.get("method", "GET"))
                with urllib.request.urlopen(request, timeout=30) as response:
                    raw = response.read().decode()
                    try:
                        item = json.loads(raw)
                    except json.JSONDecodeError:
                        item = raw
                handle = "success"
            except Exception as error:
                item = {"error": str(error)}
                handle = "error"
            target = str(data.get("responseVariable", "")).strip()
            if target:
                context["variables"][target] = item
                set_variable(context["db_user_id"], target, item)
        node = next_node(node["id"], handle)
    raise RuntimeError("Workflow exceeded 100 steps")

def find_trigger(update):
    callback = update.get("callback_query")
    if callback:
        data = callback.get("data", "")
        if data.startswith("node:"):
            return next((item for item in WORKFLOW["nodes"] if item["id"] == data[5:]), None)
        return next((item for item in WORKFLOW["nodes"] if item["type"] == "callbackTrigger" and str(item.get("data", {}).get("callbackData", "")) == data), None)
    text = update.get("message", {}).get("text", "")
    if text == "/start" or text.startswith("/start "):
        return next((item for item in WORKFLOW["nodes"] if item["type"] == "start"), None)
    if text.startswith("/"):
        command = text.split()[0].split("@")[0]
        found = next((item for item in WORKFLOW["nodes"] if item["type"] == "command" and item.get("data", {}).get("command") == command), None)
        if found:
            return found
    return next((item for item in WORKFLOW["nodes"] if item["type"] == "messageTrigger" and str(item.get("data", {}).get("contains", "")) in text), None)

def process_update(update):
    callback = update.get("callback_query")
    message = update.get("message") or (callback or {}).get("message")
    source = (update.get("message") or {}).get("from") or (callback or {}).get("from")
    if not message or not source:
        return
    user = upsert_user(source, message["chat"]["id"])
    context = {"user": source, "chat": message["chat"], "message": message, "location": message.get("location", {}), "contact": message.get("contact", {}), "variables": variables(user["id"]), "db_user_id": user["id"]}
    if callback:
        api("answerCallbackQuery", {"callback_query_id": callback["id"]})
    session = DB.execute("SELECT * FROM sessions WHERE user_id=?", (user["id"],)).fetchone()
    if session and update.get("message"):
        input_type = session["input_type"]
        accepted, item = True, message.get("text")
        if input_type == "contact":
            accepted, item = bool(message.get("contact")), message.get("contact")
        elif input_type == "location":
            accepted, item = bool(message.get("location")), message.get("location")
        elif input_type == "number":
            try:
                item = float(message.get("text", ""))
            except ValueError:
                accepted = False
        node = next((entry for entry in WORKFLOW["nodes"] if entry["id"] == session["node_id"]), None)
        if not accepted or not node:
            api("sendMessage", {"chat_id": message["chat"]["id"], "text": f"Ожидается: {input_type}"})
            return
        key = str(node.get("data", {}).get("variable", ""))
        context["variables"][key] = item
        set_variable(user["id"], key, item)
        DB.execute("DELETE FROM sessions WHERE user_id=?", (user["id"],))
        DB.commit()
        execute(next_node(node["id"]), context)
        return
    trigger = find_trigger(update)
    if trigger:
        execute(trigger, context)

def main():
    me = api("getMe")
    print(f"Connected as @{me.get('username', me.get('first_name'))}", flush=True)
    offset = 0
    while True:
        try:
            updates = api("getUpdates", {"offset": offset, "timeout": 30, "allowed_updates": ["message", "callback_query"]}, timeout=40)
            for update in updates:
                offset = max(offset, update["update_id"] + 1)
                try:
                    process_update(update)
                except Exception as error:
                    print(f"ERROR {error}", flush=True)
        except KeyboardInterrupt:
            return
        except Exception as error:
            print(f"ERROR {error}", flush=True)
            time.sleep(2)

if __name__ == "__main__":
    main()
`
}
