"""
Custom exception classes
"""
from fastapi import HTTPException, status

class SLCAException(HTTPException):
    """Base exception for SLCA application"""
    def __init__(self, detail: str, status_code: int = status.HTTP_400_BAD_REQUEST):
        super().__init__(status_code=status_code, detail=detail)

class AuthenticationException(SLCAException):
    """Authentication related exceptions"""
    def __init__(self, detail: str = "Authentication failed"):
        super().__init__(detail=detail, status_code=status.HTTP_401_UNAUTHORIZED)

class AuthorizationException(SLCAException):
    """Authorization related exceptions"""
    def __init__(self, detail: str = "Not authorized to access this resource"):
        super().__init__(detail=detail, status_code=status.HTTP_403_FORBIDDEN)

class ResourceNotFoundException(SLCAException):
    """Resource not found exceptions"""
    def __init__(self, resource: str = "Resource"):
        super().__init__(
            detail=f"{resource} not found",
            status_code=status.HTTP_404_NOT_FOUND
        )

class ValidationException(SLCAException):
    """Validation related exceptions"""
    def __init__(self, detail: str):
        super().__init__(detail=detail, status_code=status.HTTP_400_BAD_REQUEST)

class FileUploadException(SLCAException):
    """File upload related exceptions"""
    def __init__(self, detail: str):
        super().__init__(detail=detail, status_code=status.HTTP_400_BAD_REQUEST)

class ProcessingException(SLCAException):
    """Content processing exceptions"""
    def __init__(self, detail: str = "Failed to process content"):
        super().__init__(detail=detail, status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)

class AIServiceException(SLCAException):
    """AI service related exceptions"""
    def __init__(self, detail: str = "AI service error"):
        super().__init__(detail=detail, status_code=status.HTTP_503_SERVICE_UNAVAILABLE)

class DatabaseException(SLCAException):
    """Database related exceptions"""
    def __init__(self, detail: str = "Database error occurred"):
        super().__init__(detail=detail, status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)

class ContentNotFoundException(ResourceNotFoundException):
    """Content not found exception"""
    def __init__(self):
        super().__init__(resource="Content")

class DocumentNotFoundException(ResourceNotFoundException):
    """Document not found exception"""
    def __init__(self):
        super().__init__(resource="Document")

class QuizNotFoundException(ResourceNotFoundException):
    """Quiz not found exception"""
    def __init__(self):
        super().__init__(resource="Quiz")

class UserNotFoundException(ResourceNotFoundException):
    """User not found exception"""
    def __init__(self):
        super().__init__(resource="User")

class InsufficientContentException(ValidationException):
    """Insufficient content exception"""
    def __init__(self, min_length: int = 0):
        if min_length > 0:
            detail = f"Insufficient content. Minimum {min_length} characters required"
        else:
            detail = "Insufficient content to perform this operation"
        super().__init__(detail=detail)

class ContentNotProcessedException(ValidationException):
    """Content not processed exception"""
    def __init__(self):
        super().__init__(detail="Content is still being processed. Please wait...")

class DuplicateResourceException(ValidationException):
    """Duplicate resource exception"""
    def __init__(self, resource: str = "Resource"):
        super().__init__(detail=f"{resource} already exists")
