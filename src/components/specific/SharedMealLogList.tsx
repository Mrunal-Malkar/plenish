'use client';

import React, { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import styled from 'styled-components';
import { dismissSharedMeal } from '@/actions/meals';
import { Card, CardTitle } from '@/components/ui/Card';
import { Users, Clock, EyeOff } from 'lucide-react';

// ─── Styled Components ────────────────────────────────────────────────────────

const MealList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-top: 0.5rem;
`;

const MealItem = styled.div`
  background: #1e1e1e;
  border: 1px solid #2a2a2a;
  border-radius: 10px;
  padding: 0.875rem 1rem;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.75rem;
  transition: border-color 0.2s;

  &:hover { border-color: #333; }
`;

const MealInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  flex: 1;
  min-width: 0;
`;

const MealMeta = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
`;

const MealTypeBadge = styled.span<{ $type: string }>`
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: ${({ $type }) =>
    $type === 'breakfast' ? '#fbbf24' :
    $type === 'lunch'     ? '#34d399' :
    $type === 'dinner'    ? '#818cf8' : '#a78bfa'};
`;

const SharedBadge = styled.span`
  font-size: 0.65rem;
  font-weight: 500;
  background: rgba(59, 130, 246, 0.1);
  color: #60a5fa;
  border-radius: 4px;
  padding: 0.1rem 0.4rem;
  display: flex;
  align-items: center;
  gap: 0.25rem;
`;

const TimeStamp = styled.span`
  font-size: 0.75rem;
  color: #4b5563;
  display: flex;
  align-items: center;
  gap: 0.25rem;
`;

const MealText = styled.p`
  margin: 0;
  color: #e5e7eb;
  font-size: 0.9rem;
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const ParticipantRow = styled.div`
  font-size: 0.75rem;
  color: #6b7280;
  display: flex;
  align-items: center;
  gap: 0.3rem;
  flex-wrap: wrap;
`;

const DismissButton = styled.button`
  flex-shrink: 0;
  background: transparent;
  border: none;
  color: #4b5563;
  cursor: pointer;
  padding: 0.3rem;
  border-radius: 6px;
  display: flex;
  align-items: center;
  transition: color 0.2s, background 0.2s;

  &:hover { background: rgba(107, 114, 128, 0.15); color: #9ca3af; }
  &:disabled { opacity: 0.3; cursor: not-allowed; }
`;

const DismissError = styled.p`
  margin: 0.25rem 0 0;
  color: #f87171;
  font-size: 0.8rem;
`;

// ─── Types ────────────────────────────────────────────────────────────────────

interface Participant {
  user_id: string;
  dismissed: boolean;
}

interface SharedMeal {
  id: string;
  log_text: string;
  meal_type: string;
  user_id: string;
  eaten_at: string;
  meal_participants?: Participant[];
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SharedMealLogList({ meals }: { meals: SharedMeal[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [dismissError, setDismissError] = React.useState<string | null>(null);

  const handleDismiss = (mealId: string) => {
    if (!confirm('Hide this shared meal from your view?')) return;
    setDismissError(null);
    startTransition(async () => {
      try {
        await dismissSharedMeal(mealId);
        router.refresh();
      } catch (err) {
        const message = err instanceof Error ? err.message : '';
        // Silently ignore when the original logger accidentally hits dismiss
        if (message.includes('logged yourself')) return;
        setDismissError(message || 'Failed to dismiss meal.');
      }
    });
  };

  return (
    <Card>
      <CardTitle>
        <Users size={20} color="#3b82f6" />
        Household Meals
      </CardTitle>

      {dismissError && <DismissError>{dismissError}</DismissError>}
      <MealList>
        {meals.map((meal) => {
          const date = new Date(meal.eaten_at);
          const formatted = date.toLocaleDateString('en-US', {
            weekday: 'short', hour: 'numeric', minute: '2-digit',
          });
          const participantCount = (meal.meal_participants ?? []).filter((p) => !p.dismissed).length;

          return (
            <MealItem key={meal.id}>
              <MealInfo>
                <MealMeta>
                  <MealTypeBadge $type={meal.meal_type}>● {meal.meal_type}</MealTypeBadge>
                  <SharedBadge><Users size={9} /> shared</SharedBadge>
                  <TimeStamp><Clock size={10} />{formatted}</TimeStamp>
                </MealMeta>
                <MealText>{meal.log_text}</MealText>
                {participantCount > 0 && (
                  <ParticipantRow>
                    <Users size={10} />
                    {participantCount} co-eater{participantCount !== 1 ? 's' : ''}
                  </ParticipantRow>
                )}
              </MealInfo>
              <DismissButton
                onClick={() => handleDismiss(meal.id)}
                disabled={isPending}
                title="Hide from my view"
              >
                <EyeOff size={14} />
              </DismissButton>
            </MealItem>
          );
        })}
      </MealList>
    </Card>
  );
}
