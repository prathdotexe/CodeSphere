from fastapi import FastAPI, APIRouter, WebSocket, WebSocketDisconnect
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import Dict, List, Optional
import uuid
from datetime import datetime, timezone
import json

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app
app = FastAPI(title="CodeSphere API")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ============ Models ============

class SessionCreate(BaseModel):
    language: str = "javascript"

class SessionResponse(BaseModel):
    session_id: str
    code: str
    language: str
    created_at: str
    participants: List[dict] = []

class Participant(BaseModel):
    user_id: str
    username: str
    joined_at: str

# ============ In-Memory State ============

class ConnectionManager:
    def __init__(self):
        # session_id -> {user_id: WebSocket}
        self.active_connections: Dict[str, Dict[str, WebSocket]] = {}
        # session_id -> {code, language, participants}
        self.session_states: Dict[str, dict] = {}

    async def connect(self, websocket: WebSocket, session_id: str, user_id: str):
        await websocket.accept()
        if session_id not in self.active_connections:
            self.active_connections[session_id] = {}
        self.active_connections[session_id][user_id] = websocket
        
        # Initialize session state if needed
        if session_id not in self.session_states:
            # Try to load from database
            session = await db.sessions.find_one({"session_id": session_id}, {"_id": 0})
            if session:
                self.session_states[session_id] = {
                    "code": session.get("code", ""),
                    "language": session.get("language", "javascript"),
                    "participants": []
                }
            else:
                self.session_states[session_id] = {
                    "code": "",
                    "language": "javascript",
                    "participants": []
                }

    def disconnect(self, session_id: str, user_id: str):
        if session_id in self.active_connections:
            self.active_connections[session_id].pop(user_id, None)
            if not self.active_connections[session_id]:
                del self.active_connections[session_id]
        
        # Remove from participants
        if session_id in self.session_states:
            self.session_states[session_id]["participants"] = [
                p for p in self.session_states[session_id]["participants"]
                if p.get("userId") != user_id
            ]

    async def broadcast(self, session_id: str, message: dict, exclude_user: str = None):
        if session_id in self.active_connections:
            for user_id, websocket in self.active_connections[session_id].items():
                if exclude_user and user_id == exclude_user:
                    continue
                try:
                    await websocket.send_json(message)
                except Exception as e:
                    logger.error(f"Error broadcasting to {user_id}: {e}")

    async def send_to_user(self, session_id: str, user_id: str, message: dict):
        if session_id in self.active_connections:
            websocket = self.active_connections[session_id].get(user_id)
            if websocket:
                try:
                    await websocket.send_json(message)
                except Exception as e:
                    logger.error(f"Error sending to {user_id}: {e}")

    def get_participants(self, session_id: str) -> List[dict]:
        if session_id in self.session_states:
            return self.session_states[session_id].get("participants", [])
        return []

    def add_participant(self, session_id: str, user_id: str, username: str):
        if session_id in self.session_states:
            # Check if already exists
            existing = [p for p in self.session_states[session_id]["participants"] if p.get("userId") == user_id]
            if not existing:
                self.session_states[session_id]["participants"].append({
                    "userId": user_id,
                    "username": username,
                    "joinedAt": datetime.now(timezone.utc).isoformat()
                })

    def update_code(self, session_id: str, code: str):
        if session_id in self.session_states:
            self.session_states[session_id]["code"] = code

    def update_language(self, session_id: str, language: str):
        if session_id in self.session_states:
            self.session_states[session_id]["language"] = language

    def get_session_state(self, session_id: str) -> dict:
        return self.session_states.get(session_id, {})

manager = ConnectionManager()

# ============ REST Endpoints ============

@api_router.get("/")
async def root():
    return {"message": "CodeSphere API"}

@api_router.post("/sessions", response_model=SessionResponse)
async def create_session(data: SessionCreate = None):
    """Create a new collaboration session"""
    if data is None:
        data = SessionCreate()
    
    session_id = str(uuid.uuid4())[:8]
    now = datetime.now(timezone.utc)
    
    session_doc = {
        "session_id": session_id,
        "code": "",
        "language": data.language,
        "created_at": now.isoformat(),
        "participants": []
    }
    
    await db.sessions.insert_one(session_doc)
    
    return SessionResponse(
        session_id=session_id,
        code="",
        language=data.language,
        created_at=now.isoformat(),
        participants=[]
    )

@api_router.get("/sessions/{session_id}", response_model=SessionResponse)
async def get_session(session_id: str):
    """Get session details"""
    session = await db.sessions.find_one({"session_id": session_id}, {"_id": 0})
    if not session:
        # Create if doesn't exist
        now = datetime.now(timezone.utc)
        session = {
            "session_id": session_id,
            "code": "",
            "language": "javascript",
            "created_at": now.isoformat(),
            "participants": []
        }
        await db.sessions.insert_one(session)
    
    return SessionResponse(
        session_id=session["session_id"],
        code=session.get("code", ""),
        language=session.get("language", "javascript"),
        created_at=session.get("created_at", datetime.now(timezone.utc).isoformat()),
        participants=session.get("participants", [])
    )

# ============ WebSocket Endpoint ============

@api_router.websocket("/ws/{session_id}/{user_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str, user_id: str):
    await manager.connect(websocket, session_id, user_id)
    logger.info(f"User {user_id} connected to session {session_id}")
    
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            msg_type = message.get("type")
            
            if msg_type == "join":
                username = message.get("username", f"User_{user_id[:4]}")
                manager.add_participant(session_id, user_id, username)
                
                # Send current session state to the new user
                state = manager.get_session_state(session_id)
                await manager.send_to_user(session_id, user_id, {
                    "type": "session_state",
                    "code": state.get("code", ""),
                    "language": state.get("language", "javascript"),
                    "participants": state.get("participants", [])
                })
                
                # Notify others
                await manager.broadcast(session_id, {
                    "type": "user_joined",
                    "userId": user_id,
                    "username": username,
                    "participants": manager.get_participants(session_id)
                }, exclude_user=user_id)
                
                # Send updated participants to all
                await manager.broadcast(session_id, {
                    "type": "participants_update",
                    "participants": manager.get_participants(session_id)
                })
            
            elif msg_type == "code_change":
                code = message.get("code", "")
                manager.update_code(session_id, code)
                
                # Save to database periodically (debounced in real app)
                await db.sessions.update_one(
                    {"session_id": session_id},
                    {"$set": {"code": code}},
                    upsert=True
                )
                
                # Broadcast to others
                await manager.broadcast(session_id, {
                    "type": "code_change",
                    "code": code,
                    "userId": user_id
                }, exclude_user=user_id)
            
            elif msg_type == "language_change":
                language = message.get("language", "javascript")
                manager.update_language(session_id, language)
                
                await db.sessions.update_one(
                    {"session_id": session_id},
                    {"$set": {"language": language}},
                    upsert=True
                )
                
                await manager.broadcast(session_id, {
                    "type": "language_change",
                    "language": language,
                    "userId": user_id
                }, exclude_user=user_id)
            
            elif msg_type == "cursor_update":
                await manager.broadcast(session_id, {
                    "type": "cursor_update",
                    "userId": user_id,
                    "position": message.get("position"),
                    "username": message.get("username")
                }, exclude_user=user_id)
            
            elif msg_type in ["webrtc_offer", "webrtc_answer", "webrtc_ice"]:
                # Relay WebRTC signaling messages
                await manager.broadcast(session_id, message, exclude_user=user_id)
    
    except WebSocketDisconnect:
        logger.info(f"User {user_id} disconnected from session {session_id}")
        username = None
        participants = manager.get_participants(session_id)
        for p in participants:
            if p.get("userId") == user_id:
                username = p.get("username")
                break
        
        manager.disconnect(session_id, user_id)
        
        # Notify others
        await manager.broadcast(session_id, {
            "type": "user_left",
            "userId": user_id,
            "username": username,
            "participants": manager.get_participants(session_id)
        })
    except Exception as e:
        logger.error(f"WebSocket error for user {user_id}: {e}")
        manager.disconnect(session_id, user_id)

# Include the router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
