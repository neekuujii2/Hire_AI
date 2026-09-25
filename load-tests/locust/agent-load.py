"""
Locust load test for HireAI Python agent endpoints.
Tests /agent/prep, /agent/score, and /agent/screen endpoints with 100 concurrent users.
"""

import json
import random
import string
from locust import HttpUser, task, between, events
from locust.exception import StopUser


class AgentAPIUser(HttpUser):
    """
    Simulates users interacting with the HireAI agent API endpoints.
    Tests prep, score, and screening endpoints with realistic payloads.
    """
    
    wait_time = between(1, 3)  # Wait 1-3 seconds between tasks
    
    def on_start(self):
        """Initialize user session when starting."""
        self.session_id = None
        self.base_headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        }
        
        # Add authentication if provided via environment
        import os
        token = os.environ.get('TEST_TOKEN')
        if token:
            self.base_headers['Authorization'] = f'Bearer {token}'
            self.base_headers['X-Internal-Secret'] = token
    
    def generate_candidate_data(self):
        """Generate realistic candidate data for testing."""
        first_names = ['Alex', 'Jordan', 'Taylor', 'Casey', 'Riley', 'Morgan', 'Quinn', 'Avery']
        last_names = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis']
        
        return {
            'cv_url': f'data:text/plain;base64,{self._encode_base64(self._generate_mock_cv())}',
            'jd_text': 'Senior Full Stack Engineer position requiring 5+ years experience with React, Node.js, Python, AWS, and microservices architecture.',
            'company': 'TechCorp Inc.',
            'language_mode': {
                'primary': 'en',
                'mixed': False,
            },
            'user_id': f'test-user-{"".join(random.choices(string.ascii_lowercase + string.digits, k=8))}'
        }
    
    def _generate_mock_cv(self):
        """Generate a mock CV text."""
        return """
John Doe
Senior Software Engineer
john.doe@email.com | (555) 123-4567 | linkedin.com/in/johndoe

EXPERIENCE
Senior Software Engineer | Tech Corp | 2020-Present
- Led development of microservices architecture serving 1M+ users
- Improved system performance by 40% through optimization and caching
- Mentored 5 junior developers in React, Node.js, and Python best practices

Software Engineer | StartupXYZ | 2018-2020  
- Built RESTful APIs using Node.js and Express
- Implemented CI/CD pipelines reducing deployment time by 60%
- Collaborated with cross-functional teams using Agile methodologies

EDUCATION
Master of Science in Computer Science | Stanford University | 2018
Bachelor of Science in Software Engineering | UC Berkeley | 2016

SKILLS
Languages: Python, JavaScript, TypeScript, Java
Frameworks: React, Node.js, Express, Django, Spring Boot
Tools: Docker, Kubernetes, AWS, Git, Jenkins
Databases: PostgreSQL, MongoDB, Redis
"""
    
    def _encode_base64(self, text):
        """Encode text to base64."""
        import base64
        return base64.b64encode(text.encode('utf-8')).decode('utf-8')
    
    @task(3)
    def test_prep_endpoint(self):
        """Test the /agent/prep endpoint - creates interview session."""
        with self.client.post(
            "/agent/prep",
            json=self.generate_candidate_data(),
            headers=self.base_headers,
            catch_response=True,
            name="POST /agent/prep"
        ) as response:
            if response.status_code in [200, 201]:
                try:
                    data = response.json()
                    # Store session ID for potential follow-up requests
                    self.session_id = data.get('session_id') or data.get('id')
                    response.success()
                except json.JSONDecodeError:
                    response.failure("Invalid JSON response")
            elif response.status_code == 429:
                # Rate limiting - acceptable under load
                response.success()
            else:
                response.failure(f"Unexpected status: {response.status_code}")
    
    @task(2)
    def test_score_endpoint(self):
        """Test the /agent/score endpoint - scores completed interview."""
        # Need a valid session ID to score
        if not self.session_id:
            # Create a session first if we don't have one
            self.test_prep_endpoint()
            if not self.session_id:
                return  # Skip if we couldn't create a session
        
        with self.client.post(
            "/agent/score",
            json={"session_id": self.session_id},
            headers=self.base_headers,
            catch_response=True,
            name="POST /agent/score"
        ) as response:
            if response.status_code in [200, 201]:
                try:
                    data = response.json()
                    if 'scorecard' in data or 'session_id' in data:
                        response.success()
                    else:
                        response.failure("Missing scorecard in response")
                except json.JSONDecodeError:
                    response.failure("Invalid JSON response")
            elif response.status_code == 404:
                # Session might not be ready yet - create new one
                self.session_id = None
                response.failure("Session not found - will retry")
            elif response.status_code == 429:
                response.success()
            else:
                response.failure(f"Unexpected status: {response.status_code}")
    
    @task(1)
    def test_screen_endpoint(self):
        """Test the /agent/screen endpoint - resume screening."""
        screen_payload = {
            'cv_text': 'Experienced software engineer with 5 years in full-stack development.',
            'cv_url': '',
            'job_title': 'Senior Software Engineer',
            'job_description': 'We are looking for a Senior Software Engineer with experience in React and Node.js.',
            'requirements': '5+ years experience, React, Node.js, AWS, microservices',
            'skills_required': ['React', 'Node.js', 'JavaScript', 'AWS', 'Docker'],
            'org_id': f'test-org-{"".join(random.choices(string.ascii_lowercase + string.digits, k=6))}'
        }
        
        with self.client.post(
            "/agent/screen",
            json=screen_payload,
            headers=self.base_headers,
            catch_response=True,
            name="POST /agent/screen"
        ) as response:
            if response.status_code == 200:
                try:
                    data = response.json()
                    # Validate expected fields
                    required_fields = ['overall_score', 'skills_match_score', 'recommendation']
                    if all(field in data for field in required_fields):
                        response.success()
                    else:
                        response.failure(f"Missing required fields: {required_fields}")
                except json.JSONDecodeError:
                    response.failure("Invalid JSON response")
            elif response.status_code == 429:
                response.success()
            else:
                response.failure(f"Unexpected status: {response.status_code}")


# Custom event listeners for detailed reporting
@events.request.add_listener
def on_request(request_type, name, response_time, response_length, response, context, exception, start_time, url, **kwargs):
    """Custom request tracking for detailed metrics."""
    if exception:
        # Log failed requests
        pass
    elif response.status_code >= 400:
        # Log client/server errors
        pass


@events.test_start.add_listener
def on_test_start(environment, **kwargs):
    """Called when a test is starting."""
    print("Load test is starting...")


@events.test_stop.add_listener
def on_test_stop(environment, **kwargs):
    """Called when a test is stopping."""
    print("Load test is stopping...")
    print(f"Total requests: {environment.stats.total.num_requests}")
    print(f"Failed requests: {environment.stats.total.num_failures}")
    print(f"Average response time: {environment.stats.total.avg_response_time:.2f}ms")
