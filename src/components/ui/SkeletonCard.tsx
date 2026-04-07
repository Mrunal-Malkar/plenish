'use client';

import styled, { keyframes } from 'styled-components';

const shimmer = keyframes`
  0% { background-position: -400px 0; }
  100% { background-position: 400px 0; }
`;

const SkeletonBase = styled.div`
  background: linear-gradient(90deg, #1a1a1a 25%, #242424 50%, #1a1a1a 75%);
  background-size: 800px 100%;
  animation: ${shimmer} 1.4s ease-in-out infinite;
  border-radius: 8px;
`;

const Wrapper = styled.div`
  background-color: #1a1a1a;
  border: 1px solid #333;
  border-radius: 16px;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const Line = styled(SkeletonBase)<{ $width?: string; $height?: string }>`
  width: ${p => p.$width ?? '100%'};
  height: ${p => p.$height ?? '1rem'};
`;

export function SkeletonCard() {
  return (
    <Wrapper>
      <Line $width="40%" $height="1.25rem" />
      <Line $height="200px" />
      <Line $width="70%" $height="1.5rem" />
      <Line $width="50%" />
      <Line />
      <Line $height="2.75rem" />
    </Wrapper>
  );
}
