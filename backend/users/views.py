"""
User API endpoints
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from config.database import get_db
from config.settings import settings
from users.models import User
from users.schemas import (
    UserCreate, UserLogin, UserResponse, UserUpdate, 
    TokenResponse, PasswordResetRequest, PasswordReset
)
from users.auth import (
    get_password_hash, verify_password, create_access_token,
    get_current_user, get_current_verified_user
)
from utils.logger import logger
from jose import jwt, JWTError
import uuid

router = APIRouter(prefix="/api/users", tags=["users"])

@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register_user(user_data: UserCreate, db: Session = Depends(get_db)):
    """
    Register a new user
    
    Args:
        user_data: User registration data
        db: Database session
        
    Returns:
        Token and user data
    """
    from utils.logger import logger
    
    logger.info(f"Registration attempt for email: {user_data.email}")
    logger.info(f"Registration data: first_name={user_data.first_name}, last_name={user_data.last_name}")
    
    # Check if user already exists
    existing_user = db.query(User).filter(User.email == user_data.email).first()
    if existing_user:
        logger.warning(f"Registration failed: Email {user_data.email} already registered")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Create new user
    hashed_password = get_password_hash(user_data.password)
    new_user = User(
        email=user_data.email,
        password_hash=hashed_password,
        first_name=user_data.first_name,
        last_name=user_data.last_name,
        is_verified=True  # Auto-verified for MVP; enhance with SMTP for production
    )
    
    logger.info(f"Creating new user: {user_data.email}")
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    logger.info(f"User created successfully with ID: {new_user.id}")
    
    # Create access token
    access_token = create_access_token(data={"sub": str(new_user.id)})
    logger.info(f"Access token created for user: {new_user.id}")
    
    return TokenResponse(
        access_token=access_token,
        user=UserResponse.from_orm(new_user)
    )

@router.post("/login", response_model=TokenResponse)
def login_user(credentials: UserLogin, db: Session = Depends(get_db)):
    """
    User login
    
    Args:
        credentials: Login credentials
        db: Database session
        
    Returns:
        Token and user data
    """
    logger.info(f"Login attempt for email: {credentials.email}")
    
    # Find user
    user = db.query(User).filter(User.email == credentials.email).first()
    if not user:
        logger.warning(f"Login failed: User not found - {credentials.email}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"}
        )
    
    # Verify password
    if not verify_password(credentials.password, user.password_hash):
        logger.warning(f"Login failed: Invalid password for user - {credentials.email}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"}
        )
    
    # Create access token
    access_token = create_access_token(data={"sub": str(user.id)})
    logger.info(f"Login successful for user: {user.email} (ID: {user.id})")
    
    return TokenResponse(
        access_token=access_token,
        user=UserResponse.from_orm(user)
    )

@router.get("/me", response_model=UserResponse)
def get_current_user_info(current_user: User = Depends(get_current_user)):
    """
    Get current user information
    
    Args:
        current_user: Current authenticated user
        
    Returns:
        User data
    """
    return UserResponse.from_orm(current_user)

@router.put("/me", response_model=UserResponse)
def update_user_profile(
    user_data: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Update user profile
    
    Args:
        user_data: Updated user data
        current_user: Current authenticated user
        db: Database session
        
    Returns:
        Updated user data
    """
    # Update user fields
    if user_data.first_name is not None:
        current_user.first_name = user_data.first_name
    if user_data.last_name is not None:
        current_user.last_name = user_data.last_name
    if user_data.profile_picture_url is not None:
        current_user.profile_picture_url = user_data.profile_picture_url
    
    db.commit()
    db.refresh(current_user)
    
    return UserResponse.from_orm(current_user)

@router.post("/password-reset-request")
def request_password_reset(
    request: PasswordResetRequest,
    db: Session = Depends(get_db)
):
    """
    Request password reset
    
    Args:
        request: Password reset request
        db: Database session
        
    Returns:
        Success message
    """
    user = db.query(User).filter(User.email == request.email).first()
    if not user:
        # Don't reveal if user exists
        return {"message": "If the email exists, a reset link has been sent"}
    
    # Generate password reset token (valid for 1 hour)
    from datetime import datetime, timedelta
    reset_token_data = {
        "sub": str(user.id),
        "email": user.email,
        "exp": datetime.utcnow() + timedelta(hours=1),
        "type": "password_reset"
    }
    reset_token = create_access_token(data=reset_token_data)
    
    # In production, send email with reset link:
    # reset_link = f"{settings.FRONTEND_URL}/reset-password?token={reset_token}"
    # send_email(to=user.email, subject="Password Reset", body=f"Click here: {reset_link}")
    
    # For MVP, log the token (in production, this would be sent via email)
    print(f"Password reset token for {user.email}: {reset_token}")
    
    return {"message": "If the email exists, a reset link has been sent"}

@router.post("/reset-password")
def reset_password(
    request: PasswordReset,
    db: Session = Depends(get_db)
):
    """
    Reset password using token
    
    Args:
        request: Password reset with token and new password
        db: Database session
        
    Returns:
        Success message
    """
    try:
        # Verify token
        payload = jwt.decode(
            request.token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM]
        )
        
        # Verify token type
        if payload.get("type") != "password_reset":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid reset token"
            )
        
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid reset token"
            )
        
        # Get user
        user = db.query(User).filter(User.id == uuid.UUID(user_id)).first()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        
        # Update password
        user.password_hash = get_password_hash(request.new_password)
        db.commit()
        
        return {"message": "Password reset successful"}
        
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reset token has expired"
        )
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid reset token"
        )

@router.post("/verify-email")
def verify_email(
    token: str,
    db: Session = Depends(get_db)
):
    """
    Verify email using verification token
    
    Args:
        token: Email verification token
        db: Database session
        
    Returns:
        Success message
    """
    try:
        # Verify token
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM]
        )
        
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid verification token"
            )
        
        # Get user
        user = db.query(User).filter(User.id == uuid.UUID(user_id)).first()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        
        # Verify email
        user.is_verified = True
        db.commit()
        
        return {"message": "Email verified successfully"}
        
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification token has expired"
        )
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid verification token"
        )
