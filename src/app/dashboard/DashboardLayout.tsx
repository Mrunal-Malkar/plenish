'use client';

import styled, { keyframes } from 'styled-components';
import { AIChatBox } from '@/components/specific/AIChatBox';
import { LogMealForm } from '@/components/specific/LogMealForm';
import { Utensils, LogOut } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(-8px); }
  to   { opacity: 1; transform: translateY(0); }
`;

const DashboardContainer = styled.div`
  min-height: 100vh;
  background-color: #0a0c0a;
  color: #f0f0f0;
  font-family: var(--font-geist-sans), sans-serif;
  display: flex;
  flex-direction: column;
`;

const NavBar = styled.nav`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 2rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(10, 12, 10, 0.85);
  backdrop-filter: blur(12px);
  position: sticky;
  top: 0;
  z-index: 10;
  animation: ${fadeIn} 0.3s ease forwards;
`;

const NavLogo = styled.div`
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font-size: 1.25rem;
  font-weight: 700;
  letter-spacing: -0.03em;
  color: #f0f0f0;
`;

const LogoAccent = styled.span`
  background: linear-gradient(135deg, #48c78e, #3b82f6);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
`;

const SignOutButton = styled.button`
  display: flex;
  align-items: center;
  gap: 0.4rem;
  background: transparent;
  color: #6b7280;
  border: 1px solid rgba(255,255,255,0.08);
  padding: 0.5rem 1rem;
  border-radius: 8px;
  font-size: 0.875rem;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    color: #f0f0f0;
    border-color: rgba(255,255,255,0.2);
    background: rgba(255,255,255,0.04);
  }
`;

const PageContent = styled.main`
  flex: 1;
  padding: 2rem;
  max-width: 1400px;
  width: 100%;
  margin: 0 auto;
  display: grid;
  gap: 2rem;
  grid-template-columns: 1fr;
  animation: ${fadeIn} 0.4s ease 0.1s both;

  @media (min-width: 1024px) {
    grid-template-columns: 60% 1fr;
  }
`;

const RightColumn = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2rem;
`;

const LeftColumn = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2rem;
`;

export function DashboardLayout({ recentMealsSlot, recommendationSlot }: { recentMealsSlot: React.ReactNode; recommendationSlot: React.ReactNode }) {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <DashboardContainer>
      <NavBar>
        <NavLogo>
          <Utensils size={20} color="#48c78e" />
          <LogoAccent>Plenish</LogoAccent>
        </NavLogo>
        <SignOutButton id="sign-out-btn" onClick={handleSignOut}>
          <LogOut size={14} />
          Sign out
        </SignOutButton>
      </NavBar>

      <PageContent>
        {/* Left Column — Primary AI Interaction & Forms */}
        <LeftColumn>
          <AIChatBox />
          <LogMealForm />
        </LeftColumn>

        {/* Right Column — Context & Progress */}
        <RightColumn>
          {recentMealsSlot}
          {recommendationSlot}
        </RightColumn>
      </PageContent>
    </DashboardContainer>
  );
}
