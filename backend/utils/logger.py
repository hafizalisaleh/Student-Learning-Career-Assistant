"""
Logging configuration
"""
import logging
import sys
from pathlib import Path
from logging.handlers import RotatingFileHandler
from datetime import datetime

# Create logs directory if it doesn't exist
LOGS_DIR = Path("logs")
LOGS_DIR.mkdir(exist_ok=True)

# Create logger
logger = logging.getLogger("slca")
logger.setLevel(logging.INFO)

# Create formatters
detailed_formatter = logging.Formatter(
    '%(asctime)s - %(name)s - %(levelname)s - [%(filename)s:%(lineno)d] - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)

simple_formatter = logging.Formatter(
    '%(asctime)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)

# File handler for all logs
file_handler = RotatingFileHandler(
    LOGS_DIR / "slca.log",
    maxBytes=10485760,  # 10MB
    backupCount=5
)
file_handler.setLevel(logging.INFO)
file_handler.setFormatter(detailed_formatter)

# File handler for errors only
error_file_handler = RotatingFileHandler(
    LOGS_DIR / "errors.log",
    maxBytes=10485760,  # 10MB
    backupCount=5
)
error_file_handler.setLevel(logging.ERROR)
error_file_handler.setFormatter(detailed_formatter)

# Console handler
console_handler = logging.StreamHandler(sys.stdout)
console_handler.setLevel(logging.INFO)
console_handler.setFormatter(simple_formatter)

# Add handlers to logger
logger.addHandler(file_handler)
logger.addHandler(error_file_handler)
logger.addHandler(console_handler)

# Prevent duplicate logs
logger.propagate = False

def get_logger(name: str = "slca") -> logging.Logger:
    """
    Get logger instance
    
    Args:
        name: Logger name
        
    Returns:
        Logger instance
    """
    return logging.getLogger(name)

# Export logger
__all__ = ['logger', 'get_logger']
