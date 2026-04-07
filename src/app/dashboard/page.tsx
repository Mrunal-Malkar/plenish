import { DashboardLayout } from './DashboardLayout';
import { RecentMeals } from '@/components/specific/RecentMeals';
import { RecommendationFetcher } from '@/components/specific/RecommendationFetcher';
import { SkeletonCard } from '@/components/ui/SkeletonCard';
import { Suspense } from 'react';
import { Card } from '@/components/ui/Card';
import { Loader2 } from 'lucide-react';

export default async function DashboardPage() {
  // We can fetch initial session-based layouts here in the future
  
  return (
    <DashboardLayout
      recentMealsSlot={
        <Suspense fallback={
          <Card style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
            <Loader2 style={{ animation: 'spin 1s linear infinite' }} />
          </Card>
        }>
          <RecentMeals />
        </Suspense>
      }
      recommendationSlot={
        <Suspense fallback={<SkeletonCard />}>
          <RecommendationFetcher />
        </Suspense>
      }
    />
  );
}
