"""
Progress analytics service
"""
from typing import Dict, List, Any
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import func
from progress.models import UserProgress, ActivityLog, ActivityType
from documents.models import Document
from notes.models import Note
from summarizer.models import Summary
from quizzes.models import Quiz, QuizAttempt
import uuid

class ProgressAnalytics:
    """Analytics service for progress tracking"""
    
    @staticmethod
    def get_or_create_progress(db: Session, user_id: uuid.UUID) -> UserProgress:
        """Get or create user progress record"""
        progress = db.query(UserProgress).filter(
            UserProgress.user_id == user_id
        ).first()
        
        if not progress:
            progress = UserProgress(user_id=user_id)
            db.add(progress)
            db.commit()
            db.refresh(progress)
        
        return progress
    
    @staticmethod
    def update_progress(db: Session, user_id: uuid.UUID):
        """Update user progress statistics"""
        progress = ProgressAnalytics.get_or_create_progress(db, user_id)
        
        # Count documents
        total_docs = db.query(func.count(Document.id)).filter(
            Document.user_id == user_id
        ).scalar()
        
        # Count notes
        total_notes = db.query(func.count(Note.id)).filter(
            Note.user_id == user_id
        ).scalar()
        
        # Count summaries
        total_summaries = db.query(func.count(Summary.id)).filter(
            Summary.user_id == user_id
        ).scalar()
        
        # Count quizzes
        total_quizzes = db.query(func.count(Quiz.id)).filter(
            Quiz.user_id == user_id
        ).scalar()
        
        # Count quiz attempts
        total_attempts = db.query(func.count(QuizAttempt.id)).filter(
            QuizAttempt.user_id == user_id
        ).scalar()
        
        # Calculate average quiz score
        avg_score = db.query(func.avg(QuizAttempt.score)).filter(
            QuizAttempt.user_id == user_id
        ).scalar()
        
        # Calculate study streak
        streak = ProgressAnalytics._calculate_streak(db, user_id)
        
        # Update progress
        progress.total_documents = total_docs or 0
        progress.total_notes = total_notes or 0
        progress.total_summaries = total_summaries or 0
        progress.total_quizzes_generated = total_quizzes or 0
        progress.total_quizzes_attempted = total_attempts or 0
        progress.average_quiz_score = round(avg_score or 0.0, 2)
        progress.study_streak_days = streak
        progress.last_activity_date = datetime.now()
        
        db.commit()
        db.refresh(progress)
        
        return progress
    
    @staticmethod
    def _calculate_streak(db: Session, user_id: uuid.UUID) -> int:
        """Calculate study streak in days"""
        activities = db.query(ActivityLog).filter(
            ActivityLog.user_id == user_id
        ).order_by(ActivityLog.timestamp.desc()).all()
        
        if not activities:
            return 0
        
        streak = 1
        current_date = activities[0].timestamp.date()
        
        for activity in activities[1:]:
            activity_date = activity.timestamp.date()
            diff = (current_date - activity_date).days
            
            if diff == 1:
                streak += 1
                current_date = activity_date
            elif diff > 1:
                break
        
        return streak
    
    @staticmethod
    def log_activity(
        db: Session, 
        user_id: uuid.UUID, 
        activity_type: ActivityType, 
        details: Dict[str, Any]
    ):
        """Log user activity"""
        activity = ActivityLog(
            user_id=user_id,
            activity_type=activity_type,
            activity_details=details
        )
        db.add(activity)
        db.commit()
        
        # Update progress after logging activity
        ProgressAnalytics.update_progress(db, user_id)
    
    @staticmethod
    def get_recent_activities(
        db: Session, 
        user_id: uuid.UUID, 
        limit: int = 10
    ) -> List[ActivityLog]:
        """Get recent activities"""
        return db.query(ActivityLog).filter(
            ActivityLog.user_id == user_id
        ).order_by(ActivityLog.timestamp.desc()).limit(limit).all()
    
    @staticmethod
    def get_quiz_performance_trend(
        db: Session,
        user_id: uuid.UUID
    ) -> List[Dict[str, Any]]:
        """Get quiz performance trend over time"""
        attempts = db.query(QuizAttempt).filter(
            QuizAttempt.user_id == user_id,
            QuizAttempt.completed_at.isnot(None)
        ).order_by(QuizAttempt.completed_at).all()

        return [
            {
                'date': attempt.completed_at.strftime('%Y-%m-%d') if attempt.completed_at else None,
                'score': attempt.score or 0,
                'quiz_id': str(attempt.quiz_id)
            }
            for attempt in attempts
            if attempt.completed_at is not None
        ]
    
    @staticmethod
    def get_document_types_breakdown(
        db: Session, 
        user_id: uuid.UUID
    ) -> Dict[str, int]:
        """Get breakdown of document types"""
        documents = db.query(
            Document.content_type,
            func.count(Document.id)
        ).filter(
            Document.user_id == user_id
        ).group_by(Document.content_type).all()
        
        return {doc_type.value: count for doc_type, count in documents}
    
    @staticmethod
    def get_weekly_activity(
        db: Session, 
        user_id: uuid.UUID
    ) -> Dict[str, int]:
        """Get activity count for the past 7 days"""
        today = datetime.now()
        week_ago = today - timedelta(days=7)
        
        activities = db.query(
            func.date(ActivityLog.timestamp),
            func.count(ActivityLog.id)
        ).filter(
            ActivityLog.user_id == user_id,
            ActivityLog.timestamp >= week_ago
        ).group_by(func.date(ActivityLog.timestamp)).all()
        
        result = {}
        for i in range(7):
            date = (today - timedelta(days=i)).strftime('%Y-%m-%d')
            result[date] = 0
        
        for date, count in activities:
            result[date.strftime('%Y-%m-%d')] = count
        
        return result
    
    @staticmethod
    def get_performance_metrics(
        db: Session,
        user_id: uuid.UUID
    ) -> Dict[str, Any]:
        """Get detailed performance metrics"""
        attempts = db.query(QuizAttempt).filter(
            QuizAttempt.user_id == user_id,
            QuizAttempt.completed_at.isnot(None),
            QuizAttempt.score.isnot(None)
        ).all()

        if not attempts:
            return {
                'best_score': 0.0,
                'worst_score': 0.0,
                'average_score': 0.0,
                'total_attempts': 0,
                'improvement_rate': 0.0,
                'strong_topics': [],
                'weak_topics': []
            }

        scores = [attempt.score for attempt in attempts if attempt.score is not None]

        if not scores:
            return {
                'best_score': 0.0,
                'worst_score': 0.0,
                'average_score': 0.0,
                'total_attempts': len(attempts),
                'improvement_rate': 0.0,
                'strong_topics': [],
                'weak_topics': []
            }
        
        # Calculate improvement rate (last 5 vs first 5)
        improvement_rate = 0.0
        if len(attempts) >= 5:
            first_5_avg = sum(scores[:5]) / 5
            last_5_avg = sum(scores[-5:]) / 5
            improvement_rate = ((last_5_avg - first_5_avg) / first_5_avg * 100) if first_5_avg > 0 else 0
        
        # Analyze topics/quiz performance for strong and weak areas
        topic_scores = {}  # topic -> list of scores
        for attempt in attempts:
            quiz = db.query(Quiz).filter(Quiz.id == attempt.quiz_id).first()
            if quiz and quiz.title:
                # Extract topic from quiz title or use full title
                topic = quiz.title
                if topic not in topic_scores:
                    topic_scores[topic] = []
                topic_scores[topic].append(attempt.score)
        
        # Calculate average score per topic
        topic_averages = {topic: sum(scores) / len(scores) for topic, scores in topic_scores.items()}
        
        # Identify strong topics (score >= 80) and weak topics (score < 60)
        strong_topics = [topic for topic, avg in topic_averages.items() if avg >= 80]
        weak_topics = [topic for topic, avg in topic_averages.items() if avg < 60]
        
        return {
            'best_score': max(scores),
            'worst_score': min(scores),
            'average_score': sum(scores) / len(scores),
            'total_attempts': len(attempts),
            'improvement_rate': round(improvement_rate, 2),
            'strong_topics': strong_topics[:5],  # Top 5 strong topics
            'weak_topics': weak_topics[:5]  # Top 5 weak topics
        }
    
    @staticmethod
    def generate_ai_insights(
        db: Session,
        user_id: uuid.UUID
    ) -> List[Dict[str, str]]:
        """Generate AI-powered insights based on user performance"""
        insights = []
        
        # Get performance metrics
        metrics = ProgressAnalytics.get_performance_metrics(db, user_id)
        progress = ProgressAnalytics.get_or_create_progress(db, user_id)
        
        # Insight 1: Study Streak
        if progress.study_streak_days >= 7:
            insights.append({
                'category': '🔥 Outstanding Consistency',
                'message': f'Incredible! You\'ve maintained a {progress.study_streak_days}-day study streak. Consistent learners retain 40% more information.',
                'priority': 'high',
                'recommendation': 'Keep this momentum going! Try to study at the same time each day to build a lasting habit.',
                'icon': 'flame'
            })
        elif progress.study_streak_days >= 3:
            insights.append({
                'category': '✨ Building Momentum',
                'message': f'Great progress with your {progress.study_streak_days}-day streak! You\'re building a strong learning habit.',
                'priority': 'medium',
                'recommendation': 'Aim for 7 days to unlock the power of consistent learning.',
                'icon': 'sparkles'
            })
        else:
            insights.append({
                'category': '🎯 Start Your Streak',
                'message': 'Daily practice leads to mastery. Start building your study streak today!',
                'priority': 'medium',
                'recommendation': 'Set aside just 15 minutes daily. Small, consistent efforts compound over time.',
                'icon': 'target'
            })
        
        # Insight 2: Quiz Performance
        if metrics['average_score'] >= 80:
            insights.append({
                'category': '🏆 Exceptional Performance',
                'message': f'Your average quiz score of {metrics["average_score"]:.1f}% places you in the top tier of learners!',
                'priority': 'high',
                'recommendation': 'Challenge yourself with harder questions or teach others to deepen your mastery.',
                'icon': 'trophy'
            })
        elif metrics['average_score'] >= 60:
            insights.append({
                'category': '📈 Solid Progress',
                'message': f'You\'re averaging {metrics["average_score"]:.1f}% on quizzes. You\'re on the right track!',
                'priority': 'medium',
                'recommendation': 'Focus on weak topics and review incorrect answers to push past 80%.',
                'icon': 'trending-up'
            })
        else:
            insights.append({
                'category': '💡 Growth Opportunity',
                'message': f'Your quiz average is {metrics["average_score"]:.1f}%. Every expert was once a beginner!',
                'priority': 'high',
                'recommendation': 'Review material thoroughly before quizzes. Consider creating more notes to reinforce learning.',
                'icon': 'lightbulb'
            })
        
        # Insight 3: Improvement Trend
        if metrics['improvement_rate'] > 10:
            insights.append({
                'category': '🚀 Rapid Improvement',
                'message': f'Amazing! Your performance has improved by {metrics["improvement_rate"]:.1f}%. You\'re mastering the material!',
                'priority': 'high',
                'recommendation': 'Your learning strategy is working. Maintain your current approach and stay curious.',
                'icon': 'rocket'
            })
        elif metrics['improvement_rate'] < -10:
            insights.append({
                'category': '⚠️ Need Attention',
                'message': f'Your scores have declined by {abs(metrics["improvement_rate"]):.1f}%. Let\'s get back on track.',
                'priority': 'high',
                'recommendation': 'Take breaks when needed. Review fundamentals and consider shorter, more frequent study sessions.',
                'icon': 'alert'
            })
        
        # Insight 4: Strong Topics
        if metrics['strong_topics']:
            topics_str = ', '.join(metrics['strong_topics'][:3])
            insights.append({
                'category': '💪 Your Strengths',
                'message': f'You excel in: {topics_str}. These are your power topics!',
                'priority': 'low',
                'recommendation': 'Use these strong areas as confidence builders. Consider mentoring others in these topics.',
                'icon': 'muscle'
            })
        
        # Insight 5: Weak Topics
        if metrics['weak_topics']:
            topics_str = ', '.join(metrics['weak_topics'][:3])
            insights.append({
                'category': '📚 Focus Areas',
                'message': f'Topics needing attention: {topics_str}. Target practice here will boost your overall score.',
                'priority': 'high',
                'recommendation': 'Create detailed notes for these topics. Break complex concepts into smaller, manageable parts.',
                'icon': 'book'
            })
        
        # Insight 6: Content Creation
        total_content = progress.total_notes + progress.total_summaries
        if total_content >= 20:
            insights.append({
                'category': '✍️ Prolific Learner',
                'message': f'You\'ve created {total_content} notes and summaries! Active learning accelerates mastery.',
                'priority': 'medium',
                'recommendation': 'Review your past notes regularly. Spaced repetition enhances long-term retention.',
                'icon': 'pen'
            })
        elif total_content < 5:
            insights.append({
                'category': '📝 Note-Taking Power',
                'message': 'Creating notes and summaries helps you retain 2-3x more information.',
                'priority': 'medium',
                'recommendation': 'After each document, create a quick summary. This active recall strengthens neural pathways.',
                'icon': 'clipboard'
            })
        
        # Insight 7: Quiz Frequency
        if metrics['total_attempts'] >= 15:
            insights.append({
                'category': '🎓 Practice Makes Perfect',
                'message': f'You\'ve completed {metrics["total_attempts"]} quizzes! Testing yourself is the most effective learning technique.',
                'priority': 'medium',
                'recommendation': 'Continue regular quiz practice. Mix topics to improve long-term retention.',
                'icon': 'graduation'
            })
        elif metrics['total_attempts'] < 5:
            insights.append({
                'category': '🧠 Test Yourself More',
                'message': 'Self-testing is proven to boost retention by up to 50%. Try more quizzes!',
                'priority': 'medium',
                'recommendation': 'Take quizzes after studying new material. They reveal gaps in understanding.',
                'icon': 'brain'
            })
        
        return insights
    
    @staticmethod
    def get_detailed_analytics(
        db: Session,
        user_id: uuid.UUID
    ) -> Dict[str, Any]:
        """Get comprehensive analytics for progress dashboard"""
        progress = ProgressAnalytics.update_progress(db, user_id)
        metrics = ProgressAnalytics.get_performance_metrics(db, user_id)
        
        # Get quiz performance by topic with trends
        attempts = db.query(QuizAttempt).filter(
            QuizAttempt.user_id == user_id,
            QuizAttempt.completed_at.isnot(None)
        ).order_by(QuizAttempt.completed_at).all()

        topic_data = {}
        for attempt in attempts:
            if attempt.completed_at is None or attempt.score is None:
                continue
            quiz = db.query(Quiz).filter(Quiz.id == attempt.quiz_id).first()
            if quiz and quiz.title:
                topic = quiz.title
                if topic not in topic_data:
                    topic_data[topic] = {
                        'scores': [],
                        'dates': [],
                        'attempts': 0
                    }
                topic_data[topic]['scores'].append(attempt.score)
                topic_data[topic]['dates'].append(attempt.completed_at)
                topic_data[topic]['attempts'] += 1
        
        quiz_performance_by_topic = []
        for topic, data in topic_data.items():
            avg_score = sum(data['scores']) / len(data['scores'])
            
            # Determine trend
            trend = 'stable'
            if len(data['scores']) >= 3:
                recent_avg = sum(data['scores'][-3:]) / 3
                older_avg = sum(data['scores'][:3]) / 3
                if recent_avg > older_avg + 5:
                    trend = 'improving'
                elif recent_avg < older_avg - 5:
                    trend = 'declining'
            
            quiz_performance_by_topic.append({
                'topic': topic,
                'avg_score': round(avg_score, 1),
                'attempts': data['attempts'],
                'last_attempt': data['dates'][-1].isoformat(),
                'trend': trend
            })
        
        # Get recent activity (last 30 days)
        thirty_days_ago = datetime.now() - timedelta(days=30)
        activities = db.query(ActivityLog).filter(
            ActivityLog.user_id == user_id,
            ActivityLog.timestamp >= thirty_days_ago
        ).all()
        
        # Group by date
        activity_by_date = {}
        for activity in activities:
            date_key = activity.timestamp.strftime('%Y-%m-%d')
            if date_key not in activity_by_date:
                activity_by_date[date_key] = {
                    'documents': 0,
                    'notes': 0,
                    'quizzes': 0,
                    'study_time': 0
                }
            
            if activity.activity_type == ActivityType.UPLOAD:
                activity_by_date[date_key]['documents'] += 1
            elif activity.activity_type == ActivityType.NOTE:
                activity_by_date[date_key]['notes'] += 1
            elif activity.activity_type in [ActivityType.QUIZ_ATTEMPT, ActivityType.QUIZ]:
                activity_by_date[date_key]['quizzes'] += 1
                # Estimate 5 minutes per quiz
                activity_by_date[date_key]['study_time'] += 5
        
        recent_activity = [
            {
                'date': date,
                'documents': data['documents'],
                'notes': data['notes'],
                'quizzes': data['quizzes'],
                'study_time': data['study_time']
            }
            for date, data in sorted(activity_by_date.items())[-14:]  # Last 14 days
        ]
        
        # Calculate consistency score (0-100)
        days_with_activity = len(activity_by_date)
        consistency_score = min(100, (days_with_activity / 30) * 100)
        
        # Calculate learning velocity (content per week)
        weeks_active = max(1, len(activity_by_date) / 7)
        total_content = progress.total_documents + progress.total_notes + progress.total_summaries
        learning_velocity = total_content / weeks_active
        
        # Get document types breakdown
        doc_breakdown = ProgressAnalytics.get_document_types_breakdown(db, user_id)
        
        # Total study time estimation (5 min per quiz + 10 min per note)
        total_study_time = (progress.total_quizzes_attempted * 5) + (progress.total_notes * 10)
        
        return {
            'total_documents': progress.total_documents,
            'total_notes': progress.total_notes,
            'total_summaries': progress.total_summaries,
            'total_quizzes': progress.total_quizzes_generated,
            'total_quiz_attempts': progress.total_quizzes_attempted,
            'average_quiz_score': round(progress.average_quiz_score, 1),
            'total_study_time': total_study_time,
            'documents_by_type': doc_breakdown,
            'quiz_performance_by_topic': sorted(
                quiz_performance_by_topic,
                key=lambda x: x['avg_score'],
                reverse=True
            ),
            'recent_activity': recent_activity,
            'study_streak': progress.study_streak_days,
            'improvement_rate': metrics['improvement_rate'],
            'best_score': metrics['best_score'],
            'consistency_score': round(consistency_score, 1),
            'learning_velocity': round(learning_velocity, 1)
        }

# Global analytics instance
progress_analytics = ProgressAnalytics()
