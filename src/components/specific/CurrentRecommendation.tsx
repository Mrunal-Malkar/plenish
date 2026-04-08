'use client';

import styled from 'styled-components';
import { Card, CardTitle } from '@/components/ui/Card';
import { Utensils, Clock, CheckCircle } from 'lucide-react';
import { useTransition } from 'react';
import { logMeal } from '@/actions/meals';
import type { Recommendation } from '@/lib/ai/getRecommendation';

const mealTypeGradient: Record<string, string> = {
  breakfast: 'linear-gradient(135deg, #78350f, #d97706)',
  lunch:     'linear-gradient(135deg, #064e3b, #10b981)',
  dinner:    'linear-gradient(135deg, #1e1b4b, #4f46e5)',
  snack:     'linear-gradient(135deg, #4a044e, #a855f7)',
};

const MealBanner = styled.div<{ $mealType: string }>`
  width: 100%;
  height: 200px;
  background: ${p => mealTypeGradient[p.$mealType] ?? 'linear-gradient(135deg, #1f2937, #374151)'};
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255,255,255,0.85);
  font-size: 1.125rem;
  font-weight: 600;
  margin-top: 1rem;
  letter-spacing: 0.02em;
`;

const DetailRow = styled.div`
  display: flex;
  gap: 1.5rem;
  color: #a3a3a3;
  font-size: 0.875rem;
  margin-top: 0.5rem;

  & > span {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }
`;

const Reason = styled.p`
  color: #d4d4d8;
  margin-top: 1rem;
  line-height: 1.5;
  font-size: 0.9rem;
`;

const LogButton = styled.button<{ $pending?: boolean }>`
  margin-top: 1.5rem;
  background-color: ${p => p.$pending ? '#1d4ed8' : '#3b82f6'};
  color: white;
  border: none;
  padding: 0.75rem;
  border-radius: 8px;
  font-weight: 600;
  cursor: ${p => p.$pending ? 'not-allowed' : 'pointer'};
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  transition: background-color 0.2s;
  opacity: ${p => p.$pending ? 0.7 : 1};

  &:hover:not(:disabled) {
    background-color: #2563eb;
  }
`;

interface Props {
  recommendation: Recommendation | null;
}

export function CurrentRecommendation({ recommendation }: Props) {
  const [isPending, startTransition] = useTransition();

  const handleLogClick = () => {
    if (!recommendation) return;
    startTransition(async () => {
      await logMeal(`${recommendation.name}: ${recommendation.description}`, recommendation.mealType);
    });
  };

  if (!recommendation) {
    return (
      <Card>
        <CardTitle>
          <Utensils size={20} color="#3b82f6" />
          Next Meal
        </CardTitle>
        <p style={{ color: '#a3a3a3', fontSize: '0.9rem' }}>
          No recommendation available. Log some meals first!
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <CardTitle>
        <Utensils size={20} color="#3b82f6" />
        Next Meal: {recommendation.mealType.charAt(0).toUpperCase() + recommendation.mealType.slice(1)}
      </CardTitle>

      <MealBanner $mealType={recommendation.mealType}>
        {recommendation.name}
      </MealBanner>

      <h3 style={{ margin: '1rem 0 0.25rem 0', color: '#fff', fontSize: '1.5rem' }}>
        {recommendation.name}
      </h3>

      <DetailRow>
        <span><Clock size={16} /> {recommendation.prepTimeMinutes} min</span>
        <span>{recommendation.estimatedCalories} kcal</span>
      </DetailRow>

      <Reason>{recommendation.description}</Reason>
      <Reason style={{ color: '#71717a', fontSize: '0.8rem' }}>{recommendation.reason}</Reason>

      <LogButton onClick={handleLogClick} $pending={isPending} disabled={isPending}>
        <CheckCircle size={18} />
        {isPending ? 'Logging...' : 'Mark as Eaten'}
      </LogButton>
    </Card>
  );
}
