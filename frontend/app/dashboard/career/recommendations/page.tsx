'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import toast from 'react-hot-toast';
import { Briefcase, TrendingUp, Award, Target, BookOpen, ArrowRight } from 'lucide-react';

function getTextValue(value: any, keys: string[], fallback = '') {
  if (!value || typeof value !== 'object') return fallback;
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }
  return fallback;
}

function getNumberValue(value: any, keys: string[]) {
  if (!value || typeof value !== 'object') return null;
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return candidate;
    }
  }
  return null;
}

export default function RecommendationsPage() {
  const [recommendations, setRecommendations] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [resume, setResume] = useState<any>(null);

  useEffect(() => {
    loadRecommendations();
  }, []);

  const loadRecommendations = async () => {
    try {
      setLoading(true);

      // Get latest resume first
      const latestResume = await api.getLatestResume();
      if (!latestResume) {
        setRecommendations(null);
        setResume(null);
        return;
      }

      setResume(latestResume);

      // Get recommendations using the resume ID
      const data = await api.getCareerRecommendations(latestResume.id);
      setRecommendations(data);
    } catch (error: any) {
      const errorMessage = error.message || error.response?.data?.detail || 'Failed to load recommendations';
      toast.error(errorMessage);
      console.error('Recommendations error:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!recommendations || !recommendations.recommendations || Object.keys(recommendations.recommendations).length === 0) {
    return (
      <div className="max-w-4xl mx-auto">
        <Card className="p-12 text-center">
          <Briefcase className="w-16 h-16 mx-auto mb-4 text-[var(--text-muted)]" />
          <h2 className="text-2xl font-bold mb-2 text-[var(--text-primary)]">No Recommendations Available</h2>
          <p className="text-[var(--text-secondary)] mb-6">
            {!resume
              ? 'Upload your resume first to get personalized career recommendations'
              : recommendations?.message || 'Upload study materials to get personalized recommendations based on your learning profile'}
          </p>
          <a
            href="/dashboard/career"
            className="inline-flex items-center gap-2 px-6 py-3 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-lg hover:bg-[var(--primary-hover)] transition-colors"
          >
            {!resume ? 'Upload Resume' : 'Go to Career Dashboard'}
            <ArrowRight className="w-4 h-4" />
          </a>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">Career Recommendations</h1>
        <p className="text-sm text-[var(--text-tertiary)] mt-0.5">
          Personalized recommendations based on your resume and learning profile
        </p>
      </div>

      {/* User Learning Profile */}
      {recommendations.interest_profile && (
        <Card className="p-6 bg-[var(--primary-light)] border-[var(--primary)]/20">
          <h2 className="text-base font-semibold mb-4 flex items-center gap-2 text-[var(--text-primary)]">
            <div className="icon-wrapper icon-documents">
              <BookOpen className="w-4 h-4" />
            </div>
            Your Learning Profile
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {recommendations.interest_profile.primary_domains && recommendations.interest_profile.primary_domains.length > 0 && (
              <div>
                <h3 className="font-semibold text-xs text-[var(--text-secondary)] mb-2">Primary Domains</h3>
                <div className="flex flex-wrap gap-2">
                  {recommendations.interest_profile.primary_domains.map((domain: string, idx: number) => (
                    <span key={idx} className="px-3 py-1 bg-[var(--documents-bg)] text-[var(--documents)] rounded-full text-xs font-medium">
                      {domain}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {recommendations.interest_profile.top_skills && recommendations.interest_profile.top_skills.length > 0 && (
              <div>
                <h3 className="font-semibold text-xs text-[var(--text-secondary)] mb-2">Learned Skills</h3>
                <div className="flex flex-wrap gap-2">
                  {recommendations.interest_profile.top_skills.slice(0, 5).map((skill: string, idx: number) => (
                    <span key={idx} className="px-3 py-1 bg-[var(--summaries-bg)] text-[var(--summaries)] rounded-full text-xs font-medium">
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {recommendations.interest_profile.top_topics && recommendations.interest_profile.top_topics.length > 0 && (
              <div>
                <h3 className="font-semibold text-xs text-[var(--text-secondary)] mb-2">Top Topics</h3>
                <div className="flex flex-wrap gap-2">
                  {recommendations.interest_profile.top_topics.slice(0, 5).map((topic: string, idx: number) => (
                    <span key={idx} className="px-3 py-1 bg-[var(--notes-bg)] text-[var(--notes)] rounded-full text-xs font-medium">
                      {topic}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Skills to Add */}
      {recommendations.recommendations.skills_to_add && recommendations.recommendations.skills_to_add.length > 0 && (
        <Card className="p-6">
          <h2 className="text-base font-semibold mb-4 flex items-center gap-2 text-[var(--text-primary)]">
            <div className="icon-wrapper icon-notes">
              <Target className="w-4 h-4" />
            </div>
            Skills to Add to Your Resume
          </h2>
          <p className="text-sm text-[var(--text-secondary)] mb-4">Based on your learning profile, consider adding these skills:</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {recommendations.recommendations.skills_to_add.map((skill: any, idx: number) => {
              const skillName = typeof skill === 'string' ? skill : (skill.skill || skill.name || 'Skill');
              const reason = typeof skill === 'object' && skill.reason ? skill.reason : '';
              const priority = typeof skill === 'object' && skill.priority ? skill.priority : 'medium';

              return (
                <div key={idx} className="bg-[var(--notes-bg)] border border-[var(--success-border)] rounded-lg p-4">
                  <h3 className="font-semibold text-[var(--notes)] mb-1 text-sm">{skillName}</h3>
                  {reason && <p className="text-xs text-[var(--text-secondary)] mb-2">{reason}</p>}
                  <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                    priority === 'high' ? 'bg-[var(--error-bg)] text-[var(--error)]' :
                    priority === 'medium' ? 'bg-[var(--warning-bg)] text-[var(--warning)]' :
                    'bg-[var(--info-bg)] text-[var(--info)]'
                  }`}>
                    {priority} priority
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Projects to Add */}
      {recommendations.recommendations.projects_to_add && recommendations.recommendations.projects_to_add.length > 0 && (
        <Card className="p-6">
          <h2 className="text-base font-semibold mb-4 flex items-center gap-2 text-[var(--text-primary)]">
            <div className="icon-wrapper icon-documents">
              <Briefcase className="w-4 h-4" />
            </div>
            Recommended Projects to Showcase
          </h2>
          <div className="space-y-3">
            {recommendations.recommendations.projects_to_add.map((project: any, idx: number) => {
              const projectIdea = typeof project === 'string' ? project : (project.project_idea || project.title || project.name || 'Project');
              const description = typeof project === 'object' && project.description ? project.description : '';
              const technologies = typeof project === 'object' && Array.isArray(project.technologies) ? project.technologies : [];
              const estimatedTime = typeof project === 'object' && project.estimated_time ? project.estimated_time : null;

              return (
                <div key={idx} className="bg-[var(--documents-bg)] border border-[var(--info-border)] rounded-lg p-4">
                  <h3 className="font-semibold text-[var(--documents)] mb-2 text-sm">{projectIdea}</h3>
                  {description && <p className="text-xs text-[var(--text-secondary)] mb-3">{description}</p>}
                  {technologies.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-[var(--text-secondary)] mb-2">Technologies:</p>
                      <div className="flex flex-wrap gap-2">
                        {technologies.map((tech: any, techIdx: number) => (
                          <span key={techIdx} className="px-2 py-1 bg-[var(--primary-light)] text-[var(--primary)] rounded text-xs font-medium">
                            {typeof tech === 'string' ? tech : tech.name || 'Tech'}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {estimatedTime && (
                    <p className="text-xs text-[var(--text-tertiary)] mt-2">Estimated time: {estimatedTime}</p>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Certifications to Pursue */}
      {recommendations.recommendations.certifications_to_pursue && recommendations.recommendations.certifications_to_pursue.length > 0 && (
        <Card className="p-6">
          <h2 className="text-base font-semibold mb-4 flex items-center gap-2 text-[var(--text-primary)]">
            <div className="icon-wrapper icon-summaries">
              <Award className="w-4 h-4" />
            </div>
            Recommended Certifications
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {recommendations.recommendations.certifications_to_pursue.map((cert: any, idx: number) => {
              const certName = typeof cert === 'string'
                ? cert
                : getTextValue(cert, ['certification_name', 'certification', 'name'], 'Certification');
              const provider = getTextValue(cert, ['provider']);
              const reason = getTextValue(cert, ['reason', 'relevance']);
              const duration = getTextValue(cert, ['duration', 'estimated_time']);
              const difficulty = getTextValue(cert, ['difficulty', 'priority']);
              const costEstimate = typeof cert === 'object' && cert.cost_estimate ? cert.cost_estimate : null;

              return (
                <div key={idx} className="bg-[var(--summaries-bg)] border border-[var(--highlight)]/20 rounded-lg p-4">
                  <h3 className="font-semibold text-[var(--summaries)] mb-1 text-sm">{certName}</h3>
                  {provider && <p className="text-xs text-[var(--text-secondary)] mb-2">{provider}</p>}
                  {reason && <p className="text-xs text-[var(--text-tertiary)] mb-3">{reason}</p>}
                  <div className="flex flex-wrap gap-2 text-xs">
                    {duration && (
                      <span className="px-2 py-1 bg-[var(--highlight-light)] text-[var(--highlight)] rounded font-medium">
                        Duration: {duration}
                      </span>
                    )}
                    {difficulty && (
                      <span className="px-2 py-1 bg-[var(--highlight-light)] text-[var(--highlight)] rounded font-medium">
                        {difficulty}
                      </span>
                    )}
                    {costEstimate && (
                      <span className="px-2 py-1 bg-[var(--highlight-light)] text-[var(--highlight)] rounded font-medium">
                        {costEstimate}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Job Roles Suited */}
      {recommendations.recommendations.job_roles_suited && recommendations.recommendations.job_roles_suited.length > 0 && (
        <Card className="p-6">
          <h2 className="text-base font-semibold mb-4 flex items-center gap-2 text-[var(--text-primary)]">
            <div className="icon-wrapper icon-career">
              <Briefcase className="w-4 h-4" />
            </div>
            Job Roles You&apos;re Suited For
          </h2>
          <div className="space-y-3">
            {recommendations.recommendations.job_roles_suited.map((role: any, idx: number) => {
              const roleTitle = typeof role === 'string'
                ? role
                : getTextValue(role, ['role_title', 'role', 'title', 'name'], 'Job Role');
              const description = getTextValue(role, ['description', 'reason']);
              const matchScore = getNumberValue(role, ['match_score', 'match_percentage']);
              const requiredSkills = typeof role === 'object' && Array.isArray(role.required_skills) ? role.required_skills : [];
              const salaryRange = typeof role === 'object' && role.salary_range ? role.salary_range : null;

              return (
                <div key={idx} className="bg-[var(--career-bg)] border border-[var(--career)]/20 rounded-lg p-4">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-semibold text-[var(--career)] text-sm">{roleTitle}</h3>
                    {matchScore && (
                      <span className="px-3 py-1 bg-[var(--career)]/20 text-[var(--career)] rounded-full text-xs font-semibold">
                        {matchScore}% Match
                      </span>
                    )}
                  </div>
                  {description && <p className="text-xs text-[var(--text-secondary)] mb-3">{description}</p>}
                  {requiredSkills.length > 0 && (
                    <div className="mb-2">
                      <p className="text-xs font-semibold text-[var(--text-secondary)] mb-2">Required Skills:</p>
                      <div className="flex flex-wrap gap-2">
                        {requiredSkills.map((skill: any, skillIdx: number) => (
                          <span key={skillIdx} className="px-2 py-1 bg-[var(--career)]/15 text-[var(--career)] rounded text-xs font-medium">
                            {typeof skill === 'string' ? skill : skill.name || 'Skill'}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {salaryRange && (
                    <p className="text-xs text-[var(--text-tertiary)]">Salary Range: {salaryRange}</p>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Immediate Actions */}
      {recommendations.recommendations.immediate_actions && recommendations.recommendations.immediate_actions.length > 0 && (
        <Card className="p-6 bg-[var(--error-bg)] border-[var(--error)]/20">
          <h2 className="text-base font-semibold mb-4 flex items-center gap-2 text-[var(--text-primary)]">
            <Target className="w-5 h-5 text-[var(--error)]" />
            Immediate Actions
          </h2>
          <div className="space-y-3">
            {recommendations.recommendations.immediate_actions.map((action: any, idx: number) => {
              const actionText = typeof action === 'string'
                ? action
                : getTextValue(action, ['action', 'title']) ||
                  (typeof action?.step === 'string' ? action.step : '') ||
                  JSON.stringify(action);
              return (
                <div key={idx} className="flex items-start gap-3 bg-[var(--card-bg)] rounded-lg p-3 border border-[var(--error-border)]">
                  <span className="flex items-center justify-center w-6 h-6 bg-[var(--error)] text-white rounded-full text-xs font-bold flex-shrink-0">
                    {idx + 1}
                  </span>
                  <p className="text-sm text-[var(--text-primary)] pt-0.5">{actionText}</p>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Learning Path */}
      {recommendations.recommendations.learning_path && recommendations.recommendations.learning_path.length > 0 && (
        <Card className="p-6">
          <h2 className="text-base font-semibold mb-4 flex items-center gap-2 text-[var(--text-primary)]">
            <div className="icon-wrapper icon-progress">
              <TrendingUp className="w-4 h-4" />
            </div>
            Your Learning Path
          </h2>
          <div className="space-y-3">
            {recommendations.recommendations.learning_path.map((step: any, idx: number) => {
              const stepText = typeof step === 'string'
                ? step
                : getTextValue(step, ['action', 'title']) ||
                  (typeof step?.step === 'string' ? step.step : '') ||
                  JSON.stringify(step);
              const timeframe = getTextValue(step, ['timeframe']);
              const resources = typeof step === 'object' && step.resources ? step.resources : null;

              return (
                <div key={idx} className="flex items-start gap-3">
                  <span className="flex items-center justify-center w-8 h-8 bg-[var(--progress)] text-white rounded-full text-sm font-bold flex-shrink-0">
                    {idx + 1}
                  </span>
                  <div className="bg-[var(--progress-bg)] border border-[var(--progress)]/20 rounded-lg p-3 flex-1">
                    <p className="text-sm text-[var(--text-primary)] font-medium">{stepText}</p>
                    {timeframe && (
                      <p className="text-xs text-[var(--text-tertiary)] mt-1">Estimated: {timeframe}</p>
                    )}
                    {resources && Array.isArray(resources) && resources.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs font-semibold text-[var(--text-secondary)] mb-1">Resources:</p>
                        <div className="flex flex-wrap gap-1">
                          {resources.map((resource: any, rIdx: number) => (
                            <span key={rIdx} className="text-xs bg-[var(--progress)]/15 text-[var(--progress)] px-2 py-1 rounded font-medium">
                              {typeof resource === 'string' ? resource : resource.name || 'Resource'}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
