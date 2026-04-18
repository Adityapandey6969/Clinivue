import os
import json
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()
HISTORY_FILE = "data/history.json"

class HistoryEntry(BaseModel):
    user_uid: str
    encrypted_data: str

def load_history():
    if not os.path.exists(HISTORY_FILE):
        return {}
    try:
        with open(HISTORY_FILE, "r") as f:
            return json.load(f)
    except:
        return {}

def save_history(data):
    os.makedirs(os.path.dirname(HISTORY_FILE), exist_ok=True)
    with open(HISTORY_FILE, "w") as f:
        json.dump(data, f)

@router.get("/{user_uid}")
def get_history(user_uid: str):
    data = load_history()
    return {"encryptedData": data.get(user_uid, "")}

@router.post("/")
def update_history(entry: HistoryEntry):
    data = load_history()
    data[entry.user_uid] = entry.encrypted_data
    save_history(data)
    return {"status": "success"}

@router.delete("/{user_uid}")
def clear_history(user_uid: str):
    data = load_history()
    if user_uid in data:
        del data[user_uid]
        save_history(data)
    return {"status": "success"}
