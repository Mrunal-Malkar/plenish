'use client';

import React, { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import styled from 'styled-components';
import { MealLog, deleteMeal } from '@/actions/meals';
import { Card, CardTitle } from '@/components/ui/Card';
import { Clock, Trash2, Utensils } from 'lucide-react';

const ListContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-top: 1rem;
`;

const MealItem = styled.div`
  background: #222;
  border: 1px solid #333;
  padding: 1rem;
  border-radius: 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  transition: transform 0.2s ease, border-color 0.2s ease;

  &:hover {
    transform: translateY(-2px);
    border-color: #444;
  }
`;

const MealInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
`;

const MealHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #a3a3a3;
  font-size: 0.8rem;
  text-transform: capitalize;
  font-weight: 500;
  letter-spacing: 0.5px;
`;

const MealText = styled.div`
  color: #fff;
  font-size: 1rem;
  font-weight: 400;
  line-height: 1.4;
`;

const DeleteButton = styled.button`
  background: transparent;
  border: none;
  color: #666;
  cursor: pointer;
  padding: 0.5rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s, color 0.2s;

  &:hover {
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem 1rem;
  color: #666;
  text-align: center;
  gap: 1rem;

  h3 {
    margin: 0;
    color: #888;
    font-size: 1.1rem;
  }
`;

export function RecentMealsList({ meals }: { meals: MealLog[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleDelete = (id: string) => {
    if (confirm('Delete this meal log?')) {
      startTransition(async () => {
        await deleteMeal(id);
        router.refresh();
      });
    }
  };

  return (
    <Card>
      <CardTitle style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Clock size={20} color="#3b82f6" />
        Recent Activity
      </CardTitle>

      {meals.length === 0 ? (
        <EmptyState>
          <Utensils size={48} opacity={0.5} />
          <div>
            <h3>No meals logged yet</h3>
            <p style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>
              Your meal history is empty. Try logging your first meal above!
            </p>
          </div>
        </EmptyState>
      ) : (
        <ListContainer>
          {meals.map((meal) => {
            const date = new Date(meal.eaten_at);
            const formattedDate = date.toLocaleDateString('en-US', {
              weekday: 'short',
              hour: 'numeric',
              minute: '2-digit'
            });

            return (
              <MealItem key={meal.id}>
                <MealInfo>
                  <MealHeader>
                    <span style={{ color: meal.meal_type === 'breakfast' ? '#fbbf24' : meal.meal_type === 'lunch' ? '#34d399' : meal.meal_type === 'dinner' ? '#818cf8' : '#a78bfa' }}>
                      ● {meal.meal_type}
                    </span>
                    <span>• {formattedDate}</span>
                  </MealHeader>
                  <MealText>{meal.log_text}</MealText>
                </MealInfo>
                <DeleteButton 
                  onClick={() => handleDelete(meal.id)}
                  disabled={isPending}
                  title="Delete log"
                >
                  <Trash2 size={18} />
                </DeleteButton>
              </MealItem>
            );
          })}
        </ListContainer>
      )}
    </Card>
  );
}
