'use client';

import styled, { keyframes } from 'styled-components';
import { Loader2 } from 'lucide-react';

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

const SpinningLoader = styled(Loader2)`
  animation: ${spin} 1s linear infinite;
`;

export function SpinnerLoader() {
  return <SpinningLoader />;
}
