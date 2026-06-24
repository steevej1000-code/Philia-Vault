import os
import sys
import unittest
import json
import datetime
from server import app
import database

class TestPushNotifications(unittest.TestCase):
    def setUp(self):
        # Configure app for testing
        app.config['TESTING'] = True
        self.client = app.test_client()
        
        # Initialize database
        database.init_db()
        
        # Setup dummy user
        self.test_email = "test_push_user@philiavault.com"
        # Check if user exists, otherwise create
        conn = database.get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM users WHERE email = ?", (self.test_email,))
        row = cursor.fetchone()
        if row:
            self.user_id = row[0]
        else:
            code = database.generate_unique_referral_code(cursor)
            cursor.execute(
                "INSERT INTO users (email, password, code_parrainage, premium_status, created_at) VALUES (?, '', ?, 1, ?)", 
                (self.test_email, code, (datetime.datetime.utcnow() - datetime.timedelta(days=2)).isoformat())
            )
            conn.commit()
            self.user_id = cursor.lastrowid
        conn.close()

        # Dummy subscription (using cryptographically valid SECP256R1 uncompressed point to satisfy cryptography validation)
        import base64
        from cryptography.hazmat.primitives.asymmetric import ec
        from cryptography.hazmat.primitives import serialization
        
        priv = ec.generate_private_key(ec.SECP256R1())
        pub_bytes = priv.public_key().public_bytes(
            encoding=serialization.Encoding.X962,
            format=serialization.PublicFormat.UncompressedPoint
        )
        
        self.dummy_sub = {
            "endpoint": "https://fcm.googleapis.com/fcm/send/dummy_endpoint_token_123",
            "keys": {
                "p256dh": base64.urlsafe_b64encode(pub_bytes).decode('utf-8').rstrip('='),
                "auth": base64.urlsafe_b64encode(os.urandom(16)).decode('utf-8').rstrip('=')
            }
        }

    def tearDown(self):
        # Clean up subscriptions and test user
        conn = database.get_db()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM push_subscriptions WHERE user_id = ?", (self.user_id,))
        cursor.execute("DELETE FROM users WHERE id = ?", (self.user_id,))
        conn.commit()
        conn.close()

    def test_database_helpers(self):
        print("Testing database helpers...")
        
        # Save subscription
        success = database.save_push_subscription(self.user_id, self.dummy_sub)
        self.assertTrue(success)
        
        # Fetch subscription
        subs = database.get_user_subscriptions(self.user_id)
        self.assertEqual(len(subs), 1)
        self.assertEqual(subs[0]['endpoint'], self.dummy_sub['endpoint'])
        
        # Deactivate subscription
        success = database.deactivate_push_subscription(self.dummy_sub['endpoint'])
        self.assertTrue(success)
        
        # Verify deactivated
        subs = database.get_user_subscriptions(self.user_id)
        self.assertEqual(len(subs), 0)

    def test_subscribe_endpoint(self):
        print("Testing endpoints...")
        
        # Test subscribe endpoint
        payload = {
            "subscription": self.dummy_sub,
            "device_type": "android"
        }
        response = self.client.post(
            '/api/push/subscribe',
            data=json.dumps(payload),
            content_type='application/json',
            headers={'X-User-Email': self.test_email}
        )
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertTrue(data['success'])

        # Test unsubscribe endpoint
        unsubscribe_payload = {
            "endpoint": self.dummy_sub['endpoint']
        }
        response = self.client.post(
            '/api/push/unsubscribe',
            data=json.dumps(unsubscribe_payload),
            content_type='application/json',
            headers={'X-User-Email': self.test_email}
        )
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertTrue(data['success'])

    def test_cron_endpoint_security(self):
        print("Testing cron endpoints security...")
        
        # 1. Without secret (should be 401)
        res = self.client.post('/api/push/send-daily-decision')
        self.assertEqual(res.status_code, 401)
        
        res = self.client.post('/api/push/send-cashflow-alert')
        self.assertEqual(res.status_code, 401)
        
        res = self.client.post('/api/push/send-renewal-reminder')
        self.assertEqual(res.status_code, 401)

        # 2. With valid secret
        os.environ['CRON_SECRET'] = 'test_cron_secret'
        headers = {'X-Cron-Secret': 'test_cron_secret'}
        
        # Ensure we have a subscription active for test
        database.save_push_subscription(self.user_id, self.dummy_sub)
        
        res = self.client.post('/api/push/send-daily-decision', headers=headers)
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertIn('sent', data)

        res = self.client.post('/api/push/send-cashflow-alert', headers=headers)
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertIn('sent', data)

        res = self.client.post('/api/push/send-renewal-reminder', headers=headers)
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertIn('sent', data)

if __name__ == '__main__':
    unittest.main()
