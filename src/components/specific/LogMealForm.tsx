'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import styled, { keyframes, css } from 'styled-components';
import { logMeal, MealType } from '@/actions/meals';
import { Card, CardTitle } from '@/components/ui/Card';
import { PlusCircle, Loader2 } from 'lucide-react';

const FormContainer = styled.form`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-top: 1rem;
`;

const InputGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const Label = styled.label`
  font-size: 0.875rem;
  color: #a3a3a3;
  font-weight: 500;
`;

const TextInput = styled.input`
  background-color: #222;
  border: 1px solid #333;
  color: #fff;
  padding: 0.875rem 1rem;
  border-radius: 8px;
  font-family: inherit;
  font-size: 1rem;
  transition: all 0.2s ease;

  &:focus {
    outline: none;
    border-color: #10b981;
    box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.2);
  }

  &::placeholder {
    color: #555;
  }
`;

const SelectInput = styled.select`
  background-color: #222;
  border: 1px solid #333;
  color: #fff;
  padding: 0.875rem 1rem;
  border-radius: 8px;
  font-family: inherit;
  font-size: 1rem;
  appearance: none;
  cursor: pointer;

  &:focus {
    outline: none;
    border-color: #10b981;
  }
`;

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

const SubmitButton = styled.button<{ $loading?: boolean }>`
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: white;
  border: none;
  padding: 0.875rem;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  transition: transform 0.2s, box-shadow 0.2s, opacity 0.2s;

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
  }

  ${props => props.$loading && css`
    opacity: 0.7;
    cursor: not-allowed;
    transform: none !important;
  `}

  svg.spinner {
    animation: ${spin} 1s linear infinite;
  }
`;

export function LogMealForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [logText, setLogText] = useState('');
  const [mealType, setMealType] = useState<MealType>('lunch');
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!logText.trim()) return;
    setErrorMsg('');

    startTransition(async () => {
      try {
        await logMeal(logText, mealType);
        setLogText(''); // Reset form on success
        router.refresh();
      } catch (e: any) {
        setErrorMsg('Failed to log meal. Are your tables created?');
      }
    });
  };

  return (
    <Card>
      <CardTitle style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <PlusCircle size={20} color="#10b981" />
        Log a Meal
      </CardTitle>
      
      {errorMsg && (
        <div style={{ color: '#ef4444', fontSize: '0.875rem', marginTop: '1rem' }}>
          {errorMsg}
        </div>
      )}

      <FormContainer onSubmit={handleSubmit}>
        <InputGroup>
          <Label htmlFor="mealType">Which meal was it?</Label>
          <SelectInput 
            id="mealType"
            value={mealType} 
            onChange={e => setMealType(e.target.value as MealType)}
            disabled={isPending}
          >
            <option value="breakfast">Breakfast</option>
            <option value="lunch">Lunch</option>
            <option value="dinner">Dinner</option>
            <option value="snack">Snack</option>
          </SelectInput>
        </InputGroup>

        <InputGroup>
          <Label htmlFor="logText">What did you eat?</Label>
          <TextInput 
            id="logText"
            placeholder="e.g. 2 eggs, avocado toast, and black coffee..."
            value={logText}
            onChange={e => setLogText(e.target.value)}
            disabled={isPending}
          />
        </InputGroup>

        <SubmitButton type="submit" $loading={isPending} disabled={isPending || !logText.trim()}>
          {isPending ? (
            <Loader2 className="spinner" size={18} />
          ) : (
            <PlusCircle size={18} />
          )}
          {isPending ? 'Logging...' : 'Save Meal'}
        </SubmitButton>
      </FormContainer>
    </Card>
  );
}
