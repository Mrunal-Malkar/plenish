import { getAIRecommendation } from '@/actions/recommendations';
import { CurrentRecommendation } from './CurrentRecommendation';

export async function RecommendationFetcher() {
  const recommendation = await getAIRecommendation();
  return <CurrentRecommendation recommendation={recommendation} />;
}
