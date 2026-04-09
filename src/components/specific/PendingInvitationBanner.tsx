'use client';

import React, { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import styled from 'styled-components';
import { respondToInvitation } from '@/actions/households';
import { CheckCircle, XCircle, Users } from 'lucide-react';

const Banner = styled.div`
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.3);
  border-radius: 12px;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
`;

const BannerHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #93c5fd;
  font-size: 0.85rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const BannerText = styled.p`
  margin: 0;
  color: #e5e7eb;
  font-size: 0.95rem;
`;

const ButtonRow = styled.div`
  display: flex;
  gap: 0.5rem;
`;

const AcceptButton = styled.button`
  display: flex;
  align-items: center;
  gap: 0.4rem;
  background: #3b82f6;
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;

  &:hover { background: #2563eb; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const DeclineButton = styled.button`
  display: flex;
  align-items: center;
  gap: 0.4rem;
  background: transparent;
  color: #9ca3af;
  border: 1px solid #4b5563;
  border-radius: 8px;
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: color 0.2s, border-color 0.2s;

  &:hover { color: #ef4444; border-color: #ef4444; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const ErrorText = styled.p`
  margin: 0;
  color: #f87171;
  font-size: 0.85rem;
`;

interface Props {
  householdId: string;
  householdName: string;
  invitedBy: string;
}

export function PendingInvitationBanner({ householdId, householdName, invitedBy }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const handle = (accept: boolean) => {
    setError(null);
    startTransition(async () => {
      try {
        await respondToInvitation(householdId, accept);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      }
    });
  };

  return (
    <Banner>
      <BannerHeader>
        <Users size={14} />
        Household Invitation
      </BannerHeader>
      <BannerText>
        You have been invited to join <strong>{householdName}</strong>
        {invitedBy ? ` by ${invitedBy}` : ''}.
      </BannerText>
      {error && <ErrorText>{error}</ErrorText>}
      <ButtonRow>
        <AcceptButton onClick={() => handle(true)} disabled={isPending}>
          <CheckCircle size={15} />
          Accept
        </AcceptButton>
        <DeclineButton onClick={() => handle(false)} disabled={isPending}>
          <XCircle size={15} />
          Decline
        </DeclineButton>
      </ButtonRow>
    </Banner>
  );
}
