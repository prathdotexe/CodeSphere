#!/usr/bin/env python3
"""
CodeSphere Backend API Testing Suite
Tests all REST endpoints and WebSocket functionality
"""

import requests
import json
import sys
import time
from datetime import datetime
import websocket
import threading
import uuid

class CodeSphereAPITester:
    def __init__(self, base_url="https://codecollab-17.preview.emergentagent.com/api"):
        self.base_url = base_url
        self.tests_run = 0
        self.tests_passed = 0
        self.session_id = None
        self.ws_messages = []
        self.ws_connected = False

    def log(self, message, level="INFO"):
        """Log test messages with timestamp"""
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"[{timestamp}] {level}: {message}")

    def run_test(self, name, test_func):
        """Run a single test and track results"""
        self.tests_run += 1
        self.log(f"🔍 Running: {name}")
        
        try:
            success = test_func()
            if success:
                self.tests_passed += 1
                self.log(f"✅ PASSED: {name}")
            else:
                self.log(f"❌ FAILED: {name}")
            return success
        except Exception as e:
            self.log(f"❌ ERROR in {name}: {str(e)}")
            return False

    def test_api_root(self):
        """TC: Test API root endpoint"""
        try:
            response = requests.get(f"{self.base_url}/", timeout=10)
            if response.status_code == 200:
                data = response.json()
                return data.get("message") == "CodeSphere API"
            return False
        except Exception as e:
            self.log(f"API root test failed: {e}")
            return False

    def test_create_session(self):
        """TC002: Test session creation"""
        try:
            # Test with default language
            response = requests.post(f"{self.base_url}/sessions", timeout=10)
            if response.status_code == 200:
                data = response.json()
                self.session_id = data.get("session_id")
                
                # Verify session_id format (8 characters)
                if self.session_id and len(self.session_id) == 8:
                    self.log(f"Created session: {self.session_id}")
                    return True
                else:
                    self.log(f"Invalid session_id format: {self.session_id}")
                    return False
            else:
                self.log(f"Create session failed with status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"Create session test failed: {e}")
            return False

    def test_create_session_with_language(self):
        """TC: Test session creation with specific language"""
        try:
            payload = {"language": "python"}
            response = requests.post(
                f"{self.base_url}/sessions", 
                json=payload,
                timeout=10
            )
            if response.status_code == 200:
                data = response.json()
                return data.get("language") == "python"
            return False
        except Exception as e:
            self.log(f"Create session with language test failed: {e}")
            return False

    def test_get_session(self):
        """TC006: Test session retrieval"""
        if not self.session_id:
            self.log("No session_id available for get test")
            return False
        
        try:
            response = requests.get(f"{self.base_url}/sessions/{self.session_id}", timeout=10)
            if response.status_code == 200:
                data = response.json()
                return (
                    data.get("session_id") == self.session_id and
                    "code" in data and
                    "language" in data and
                    "created_at" in data and
                    "participants" in data
                )
            else:
                self.log(f"Get session failed with status: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"Get session test failed: {e}")
            return False

    def test_get_nonexistent_session(self):
        """TC: Test getting non-existent session (should create it)"""
        try:
            fake_session_id = "test1234"
            response = requests.get(f"{self.base_url}/sessions/{fake_session_id}", timeout=10)
            if response.status_code == 200:
                data = response.json()
                # Should create the session if it doesn't exist
                return data.get("session_id") == fake_session_id
            return False
        except Exception as e:
            self.log(f"Get nonexistent session test failed: {e}")
            return False

    def on_ws_message(self, ws, message):
        """WebSocket message handler"""
        try:
            data = json.loads(message)
            self.ws_messages.append(data)
            self.log(f"WS Message: {data.get('type', 'unknown')}")
        except Exception as e:
            self.log(f"WS message parse error: {e}")

    def on_ws_error(self, ws, error):
        """WebSocket error handler"""
        self.log(f"WS Error: {error}")

    def on_ws_close(self, ws, close_status_code, close_msg):
        """WebSocket close handler"""
        self.ws_connected = False
        self.log("WS Connection closed")

    def on_ws_open(self, ws):
        """WebSocket open handler"""
        self.ws_connected = True
        self.log("WS Connection opened")
        
        # Send join message
        join_msg = {
            "type": "join",
            "userId": "test_user_123",
            "username": "Test User",
            "sessionId": self.session_id
        }
        ws.send(json.dumps(join_msg))

    def test_websocket_connection(self):
        """TC: Test WebSocket connection and basic messaging"""
        if not self.session_id:
            self.log("No session_id available for WebSocket test")
            return False

        try:
            # Convert HTTPS URL to WSS
            ws_url = self.base_url.replace("https://", "wss://").replace("http://", "ws://")
            ws_url = f"{ws_url}/ws/{self.session_id}/test_user_123"
            
            self.log(f"Connecting to WebSocket: {ws_url}")
            
            # Create WebSocket connection
            ws = websocket.WebSocketApp(
                ws_url,
                on_open=self.on_ws_open,
                on_message=self.on_ws_message,
                on_error=self.on_ws_error,
                on_close=self.on_ws_close
            )
            
            # Run WebSocket in a thread
            ws_thread = threading.Thread(target=ws.run_forever)
            ws_thread.daemon = True
            ws_thread.start()
            
            # Wait for connection
            timeout = 10
            start_time = time.time()
            while not self.ws_connected and (time.time() - start_time) < timeout:
                time.sleep(0.1)
            
            if not self.ws_connected:
                self.log("WebSocket connection timeout")
                return False
            
            # Test code change message
            code_msg = {
                "type": "code_change",
                "code": "console.log('Hello from test');",
                "userId": "test_user_123",
                "sessionId": self.session_id
            }
            ws.send(json.dumps(code_msg))
            
            # Test language change message
            lang_msg = {
                "type": "language_change",
                "language": "typescript",
                "userId": "test_user_123",
                "sessionId": self.session_id
            }
            ws.send(json.dumps(lang_msg))
            
            # Wait for messages
            time.sleep(2)
            
            # Close connection
            ws.close()
            
            # Check if we received expected messages
            message_types = [msg.get("type") for msg in self.ws_messages]
            expected_types = ["session_state", "participants_update"]
            
            success = any(msg_type in message_types for msg_type in expected_types)
            self.log(f"Received message types: {message_types}")
            
            return success
            
        except Exception as e:
            self.log(f"WebSocket test failed: {e}")
            return False

    def test_api_health(self):
        """TC: Test overall API health"""
        try:
            # Test if the API is responding
            response = requests.get(f"{self.base_url}/", timeout=5)
            return response.status_code == 200
        except Exception as e:
            self.log(f"API health check failed: {e}")
            return False

    def run_all_tests(self):
        """Run all backend tests"""
        self.log("🚀 Starting CodeSphere Backend API Tests")
        self.log(f"Testing against: {self.base_url}")
        
        # Test sequence
        tests = [
            ("API Health Check", self.test_api_health),
            ("API Root Endpoint", self.test_api_root),
            ("Create Session (Default)", self.test_create_session),
            ("Create Session (Python)", self.test_create_session_with_language),
            ("Get Session", self.test_get_session),
            ("Get Non-existent Session", self.test_get_nonexistent_session),
            ("WebSocket Connection", self.test_websocket_connection),
        ]
        
        for test_name, test_func in tests:
            self.run_test(test_name, test_func)
            time.sleep(0.5)  # Brief pause between tests
        
        # Print summary
        self.log("=" * 50)
        self.log(f"📊 Test Results: {self.tests_passed}/{self.tests_run} passed")
        
        if self.tests_passed == self.tests_run:
            self.log("🎉 All tests passed!")
            return True
        else:
            self.log(f"⚠️  {self.tests_run - self.tests_passed} tests failed")
            return False

def main():
    """Main test runner"""
    tester = CodeSphereAPITester()
    success = tester.run_all_tests()
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())