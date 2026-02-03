'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { CareerRecommendation } from '@/lib/types';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import toast from 'react-hot-toast';
import { Briefcase, TrendingUp, Award, Target, BookOpen, ArrowRight } from 'lucide-react';

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
          <Briefcase className="w-16 h-16 mx-auto mb-4 text-gray-400" />
          <h2 className="text-2xl font-bold mb-2">No Recommendations Available</h2>
          <p className="text-gray-600 mb-6">
            {!resume 
              ? 'Upload your resume first to get personalized career recommendations'
              : recommendations?.message || 'Upload study materials to get personalized recommendations based on your learning profile'}
          </p>
          <a
            href="/dashboard/career"
            className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors"
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
        <h1 className="text-3xl font-bold mb-2">Career Recommendations</h1>
        <p className="text-gray-600">
          Personalized recommendations based on your resume and learning profile
        </p>
      </div>

      {/* User Learning Profile */}
      {recommendations.interest_profile && (
        <Card className="p-6 bg-gradient-to-r from-blue-50 to-purple-50">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-blue-600" />
            Your Learning Profile
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {recommendations.interest_profile.primary_domains && recommendations.interest_profile.primary_domains.length > 0 && (
              <div>
                <h3 className="font-semibold text-sm text-gray-600 mb-2">Primary Domains</h3>
                <div className="flex flex-wrap gap-2">
                  {recommendations.interest_profile.primary_domains.map((domain: string, idx: number) => (
                    <span key={idx} className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm">
                      {domain}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {recommendations.interest_profile.top_skills && recommendations.interest_profile.top_skills.length > 0 && (
              <div>
                <h3 className="font-semibold text-sm text-gray-600 mb-2">Learned Skills</h3>
                <div className="flex flex-wrap gap-2">
                  {recommendations.interest_profile.top_skills.slice(0, 5).map((skill: string, idx: number) => (
                    <span key={idx} className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm">
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {recommendations.interest_profile.top_topics && recommendations.interest_profile.top_topics.length > 0 && (
              <div>
                <h3 className="font-semibold text-sm text-gray-600 mb-2">Top Topics</h3>
                <div className="flex flex-wrap gap-2">
                  {recommendations.interest_profile.top_topics.slice(0, 5).map((topic: string, idx: number) => (
                    <span key={idx} className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm">
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
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Target className="w-6 h-6 text-green-600" />
            Skills to Add to Your Resume
          </h2>
          <p className="text-gray-600 mb-4">Based on your learning profile, consider adding these skills:</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {recommendations.recommendations.skills_to_add.map((skill: any, idx: number) => {
              // Handle both object and string formats
              const skillName = typeof skill === 'string' ? skill : (skill.skill || skill.name || 'Skill');
              const reason = typeof skill === 'object' && skill.reason ? skill.reason : '';
              const priority = typeof skill === 'object' && skill.priority ? skill.priority : 'medium';
              
              return (
                <div key={idx} className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <h3 className="font-semibold text-green-900 mb-1">{skillName}</h3>
                  {reason && <p className="text-sm text-green-800 mb-2">{reason}</p>}
                  <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                    priority === 'high' ? 'bg-red-100 text-red-700' :
                    priority === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-blue-100 text-blue-700'
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
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Briefcase className="w-6 h-6 text-blue-600" />
            Recommended Projects to Showcase
          </h2>
          <div className="space-y-4">
            {recommendations.recommendations.projects_to_add.map((project: any, idx: number) => {
              const projectIdea = typeof project === 'string' ? project : (project.project_idea || project.title || project.name || 'Project');
              const description = typeof project === 'object' && project.description ? project.description : '';
              const technologies = typeof project === 'object' && Array.isArray(project.technologies) ? project.technologies : [];
              const estimatedTime = typeof project === 'object' && project.estimated_time ? project.estimated_time : null;
              
              return (
                <div key={idx} className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h3 className="font-semibold text-blue-900 mb-2">{projectIdea}</h3>
                  {description && <p className="text-sm text-blue-800 mb-3">{description}</p>}
                  {technologies.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-blue-900 mb-2">Technologies:</p>
                      <div className="flex flex-wrap gap-2">
                        {technologies.map((tech: any, techIdx: number) => (
                          <span key={techIdx} className="px-2 py-1 bg-blue-200 text-blue-900 rounded text-xs">
                            {typeof tech === 'string' ? tech : tech.name || 'Tech'}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {estimatedTime && (
                    <p className="text-xs text-blue-700 mt-2">Estimated time: {estimatedTime}</p>
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
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Award className="w-6 h-6 text-purple-600" />
            Recommended Certifications
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {recommendations.recommendations.certifications_to_pursue.map((cert: any, idx: number) => {
              const certName = typeof cert === 'string' ? cert : (cert.certification_name || cert.name || 'Certification');
              const provider = typeof cert === 'object' && cert.provider ? cert.provider : '';
              const reason = typeof cert === 'object' && cert.reason ? cert.reason : '';
              const duration = typeof cert === 'object' && cert.duration ? cert.duration : null;
              const difficulty = typeof cert === 'object' && cert.difficulty ? cert.difficulty : null;
              const costEstimate = typeof cert === 'object' && cert.cost_estimate ? cert.cost_estimate : null;
              
              return (
                <div key={idx} className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                  <h3 className="font-semibold text-purple-900 mb-1">{certName}</h3>
                  {provider && <p className="text-sm text-purple-800 mb-2">{provider}</p>}
                  {reason && <p className="text-xs text-purple-700 mb-3">{reason}</p>}
                  <div className="flex flex-wrap gap-2 text-xs">
                    {duration && (
                      <span className="px-2 py-1 bg-purple-200 text-purple-900 rounded">
                        Duration: {duration}
                      </span>
                    )}
                    {difficulty && (
                      <span className="px-2 py-1 bg-purple-200 text-purple-900 rounded">
                        {difficulty}
                      </span>
                    )}
                    {costEstimate && (
                      <span className="px-2 py-1 bg-purple-200 text-purple-900 rounded">
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
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Briefcase className="w-6 h-6 text-orange-600" />
            Job Roles You're Suited For
          </h2>
          <div className="space-y-4">
            {recommendations.recommendations.job_roles_suited.map((role: any, idx: number) => {
              const roleTitle = typeof role === 'string' ? role : (role.role_title || role.title || role.name || 'Job Role');
              const description = typeof role === 'object' && role.description ? role.description : '';
              const matchScore = typeof role === 'object' && role.match_score ? role.match_score : null;
              const requiredSkills = typeof role === 'object' && Array.isArray(role.required_skills) ? role.required_skills : [];
              const salaryRange = typeof role === 'object' && role.salary_range ? role.salary_range : null;
              
              return (
                <div key={idx} className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-semibold text-orange-900 text-lg">{roleTitle}</h3>
                    {matchScore && (
                      <span className="px-3 py-1 bg-orange-200 text-orange-900 rounded-full text-sm font-semibold">
                        {matchScore}% Match
                      </span>
                    )}
                  </div>
                  {description && <p className="text-sm text-orange-800 mb-3">{description}</p>}
                  {requiredSkills.length > 0 && (
                    <div className="mb-2">
                      <p className="text-xs font-semibold text-orange-900 mb-2">Required Skills:</p>
                      <div className="flex flex-wrap gap-2">
                        {requiredSkills.map((skill: any, skillIdx: number) => (
                          <span key={skillIdx} className="px-2 py-1 bg-orange-200 text-orange-900 rounded text-xs">
                            {typeof skill === 'string' ? skill : skill.name || 'Skill'}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {salaryRange && (
                    <p className="text-xs text-orange-700">Salary Range: {salaryRange}</p>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Immediate Actions */}
      {recommendations.recommendations.immediate_actions && recommendations.recommendations.immediate_actions.length > 0 && (
        <Card className="p-6 bg-gradient-to-r from-red-50 to-orange-50">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Target className="w-6 h-6 text-red-600" />
            Immediate Actions
          </h2>
          <div className="space-y-3">
            {recommendations.recommendations.immediate_actions.map((action: any, idx: number) => {
              const actionText = typeof action === 'string' ? action : action.action || action.step || JSON.stringify(action);
              return (
                <div key={idx} className="flex items-start gap-3 bg-white rounded-lg p-3 border border-red-200">
                  <span className="flex items-center justify-center w-6 h-6 bg-red-600 text-white rounded-full text-sm font-bold flex-shrink-0">
                    {idx + 1}
                  </span>
                  <p className="text-gray-700 pt-0.5">{actionText}</p>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Learning Path */}
      {recommendations.recommendations.learning_path && recommendations.recommendations.learning_path.length > 0 && (
        <Card className="p-6">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-indigo-600" />
            Your Learning Path
          </h2>
          <div className="space-y-3">
            {recommendations.recommendations.learning_path.map((step: any, idx: number) => {
              // Handle both string and object formats
              const stepText = typeof step === 'string' ? step : step.step || step.action || JSON.stringify(step);
              const timeframe = typeof step === 'object' && step.timeframe ? step.timeframe : null;
              const resources = typeof step === 'object' && step.resources ? step.resources : null;
              
              return (
                <div key={idx} className="flex items-start gap-3">
                  <span className="flex items-center justify-center w-8 h-8 bg-indigo-600 text-white rounded-full text-sm font-bold flex-shrink-0">
                    {idx + 1}
                  </span>
                  <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 flex-1">
                    <p className="text-indigo-900 font-medium">{stepText}</p>
                    {timeframe && (
                      <p className="text-sm text-indigo-700 mt-1">⏱️ {timeframe}</p>
                    )}
                    {resources && Array.isArray(resources) && resources.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs font-semibold text-indigo-900 mb-1">Resources:</p>
                        <div className="flex flex-wrap gap-1">
                          {resources.map((resource: any, rIdx: number) => (
                            <span key={rIdx} className="text-xs bg-indigo-200 text-indigo-900 px-2 py-1 rounded">
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
