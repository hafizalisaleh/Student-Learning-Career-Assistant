"""
Email service for sending notifications
This is a template for production email implementation
"""
from typing import List, Optional
from config.settings import settings
import logging

logger = logging.getLogger(__name__)

class EmailService:
    """Email service for sending various notifications"""
    
    def __init__(self):
        # Initialize email configuration
        # In production, use SMTP settings from environment variables
        self.smtp_server = getattr(settings, 'SMTP_SERVER', 'smtp.gmail.com')
        self.smtp_port = getattr(settings, 'SMTP_PORT', 587)
        self.smtp_username = getattr(settings, 'SMTP_USERNAME', None)
        self.smtp_password = getattr(settings, 'SMTP_PASSWORD', None)
        self.from_email = getattr(settings, 'FROM_EMAIL', 'noreply@slca.com')
    
    def send_verification_email(self, to_email: str, verification_token: str) -> bool:
        """
        Send email verification link
        
        Args:
            to_email: Recipient email address
            verification_token: JWT token for verification
            
        Returns:
            True if sent successfully, False otherwise
        """
        frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')
        verification_link = f"{frontend_url}/verify-email?token={verification_token}"
        
        subject = "Verify Your SLCA Account"
        body = f"""
        <html>
            <body>
                <h2>Welcome to SLCA!</h2>
                <p>Thank you for registering. Please verify your email address by clicking the link below:</p>
                <p><a href="{verification_link}">Verify Email Address</a></p>
                <p>This link will expire in 24 hours.</p>
                <p>If you didn't create an account, please ignore this email.</p>
                <br>
                <p>Best regards,<br>SLCA Team</p>
            </body>
        </html>
        """
        
        return self._send_email(to_email, subject, body)
    
    def send_password_reset_email(self, to_email: str, reset_token: str) -> bool:
        """
        Send password reset link
        
        Args:
            to_email: Recipient email address
            reset_token: JWT token for password reset
            
        Returns:
            True if sent successfully, False otherwise
        """
        frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')
        reset_link = f"{frontend_url}/reset-password?token={reset_token}"
        
        subject = "Reset Your SLCA Password"
        body = f"""
        <html>
            <body>
                <h2>Password Reset Request</h2>
                <p>We received a request to reset your password. Click the link below to create a new password:</p>
                <p><a href="{reset_link}">Reset Password</a></p>
                <p>This link will expire in 1 hour.</p>
                <p>If you didn't request a password reset, please ignore this email or contact support if you have concerns.</p>
                <br>
                <p>Best regards,<br>SLCA Team</p>
            </body>
        </html>
        """
        
        return self._send_email(to_email, subject, body)
    
    def send_welcome_email(self, to_email: str, first_name: str) -> bool:
        """
        Send welcome email to new users
        
        Args:
            to_email: Recipient email address
            first_name: User's first name
            
        Returns:
            True if sent successfully, False otherwise
        """
        subject = "Welcome to SLCA - Your Learning Assistant"
        body = f"""
        <html>
            <body>
                <h2>Welcome to SLCA, {first_name}!</h2>
                <p>Your account has been successfully created and verified.</p>
                <h3>Get Started:</h3>
                <ul>
                    <li>Upload your first document (PDF, DOCX, or YouTube video)</li>
                    <li>Generate notes and summaries</li>
                    <li>Test your knowledge with AI-generated quizzes</li>
                    <li>Upload your resume for career guidance</li>
                </ul>
                <p>Visit your dashboard to explore all features!</p>
                <br>
                <p>Happy learning!<br>SLCA Team</p>
            </body>
        </html>
        """
        
        return self._send_email(to_email, subject, body)
    
    def send_quiz_completion_notification(
        self, 
        to_email: str, 
        quiz_title: str, 
        score: float,
        first_name: str
    ) -> bool:
        """
        Send quiz completion notification
        
        Args:
            to_email: Recipient email address
            quiz_title: Title of completed quiz
            score: Score achieved
            first_name: User's first name
            
        Returns:
            True if sent successfully, False otherwise
        """
        subject = f"Quiz Complete: {quiz_title}"
        body = f"""
        <html>
            <body>
                <h2>Great job, {first_name}!</h2>
                <p>You've completed the quiz: <strong>{quiz_title}</strong></p>
                <h3>Your Score: {score}%</h3>
                <p>Keep up the excellent work! Continue practicing to improve your knowledge.</p>
                <p>Visit your dashboard to see detailed feedback and track your progress.</p>
                <br>
                <p>Keep learning!<br>SLCA Team</p>
            </body>
        </html>
        """
        
        return self._send_email(to_email, subject, body)
    
    def _send_email(
        self, 
        to_email: str, 
        subject: str, 
        body: str,
        cc: Optional[List[str]] = None
    ) -> bool:
        """
        Internal method to send email
        
        Args:
            to_email: Recipient email
            subject: Email subject
            body: Email body (HTML)
            cc: Optional CC recipients
            
        Returns:
            True if sent successfully, False otherwise
        """
        try:
            # Production implementation with SMTP
            if self.smtp_username and self.smtp_password:
                import smtplib
                from email.mime.text import MIMEText
                from email.mime.multipart import MIMEMultipart
                
                # Create message
                message = MIMEMultipart('alternative')
                message['Subject'] = subject
                message['From'] = self.from_email
                message['To'] = to_email
                
                if cc:
                    message['Cc'] = ', '.join(cc)
                
                # Attach HTML body
                html_part = MIMEText(body, 'html')
                message.attach(html_part)
                
                # Send email
                with smtplib.SMTP(self.smtp_server, self.smtp_port) as server:
                    server.starttls()
                    server.login(self.smtp_username, self.smtp_password)
                    recipients = [to_email] + (cc or [])
                    server.sendmail(self.from_email, recipients, message.as_string())
                
                logger.info(f"Email sent successfully to {to_email}")
                return True
            else:
                # Development mode - log instead of sending
                logger.info(f"[DEV MODE] Email would be sent to {to_email}")
                logger.info(f"Subject: {subject}")
                logger.info(f"Body: {body[:100]}...")
                return True
                
        except Exception as e:
            logger.error(f"Failed to send email to {to_email}: {str(e)}")
            return False

# Global email service instance
email_service = EmailService()
