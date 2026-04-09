'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import type { UIMessage } from 'ai';
import styled from 'styled-components';
import { Card, CardTitle } from '@/components/ui/Card';
import { MessageSquare, Send } from 'lucide-react';
import React, { useRef, useEffect } from 'react';

const ChatContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 600px;
  background-color: #1a1a1a;
  border: 1px solid #333;
  border-radius: 16px;
  padding: 1.5rem;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
`;

const HeaderRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid #333;
  margin-bottom: 1rem;
`;

const MessageList = styled.div`
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding-right: 0.5rem;

  &::-webkit-scrollbar {
    width: 6px;
  }
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  &::-webkit-scrollbar-thumb {
    background: #444;
    border-radius: 4px;
  }
`;

const MessageBubble = styled.div<{ $role: 'user' | 'assistant' }>`
  max-width: 80%;
  padding: 1rem;
  border-radius: 12px;
  line-height: 1.5;
  font-size: 0.95rem;

  ${(props) =>
    props.$role === 'user'
      ? `
      align-self: flex-end;
      background-color: #3b82f6;
      color: white;
      border-bottom-right-radius: 2px;
    `
      : `
      align-self: flex-start;
      background-color: #2a2a2a;
      border: 1px solid #444;
      color: #e5e5e5;
      border-bottom-left-radius: 2px;
    `}
`;

const InputForm = styled.form`
  display: flex;
  gap: 0.5rem;
  margin-top: 1rem;
`;

const ChatInput = styled.input`
  flex: 1;
  background-color: #222;
  border: 1px solid #444;
  color: #fff;
  padding: 1rem;
  border-radius: 9999px;
  outline: none;
  font-family: inherit;
  font-size: 1rem;

  &:focus {
    border-color: #3b82f6;
  }
  
  &::placeholder {
    color: #666;
  }
`;

const SendButton = styled.button`
  background-color: #3b82f6;
  color: white;
  border: none;
  width: 50px;
  height: 50px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform 0.2s, background-color 0.2s;

  &:hover {
    background-color: #2563eb;
    transform: scale(1.05);
  }
  
  &:disabled {
    background-color: #444;
    cursor: not-allowed;
    transform: none;
  }
`;

export function AIChatBox() {
  const { messages, status, error, sendMessage } = useChat({
    transport: new DefaultChatTransport({
      body: { tzOffset: new Date().getTimezoneOffset() },
    }),
  });
  const isLoading = status === 'streaming' || status === 'submitted';
  
  const [localInput, setLocalInput] = React.useState('');
  const endOfMessagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, error]);

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!localInput.trim()) return;
    sendMessage({ text: localInput });
    setLocalInput('');
  };

  return (
    <ChatContainer>
      <HeaderRow>
        <MessageSquare size={24} color="#a855f7" />
        <CardTitle style={{ color: '#a855f7' }}>Plenish Agent</CardTitle>
      </HeaderRow>

      <MessageList>
        <MessageBubble $role="assistant">
          ¡Hola! Soy tu asistente de Plenish. ¿Qué comiste hoy o necesitas ayuda planificando tu semana?
        </MessageBubble>
        
        {messages.map((m: UIMessage, i: number) => {
          const content = m.parts?.filter((p) => p.type === 'text').map((p) => p.text).join('') ?? '';
          return (
            <MessageBubble key={m.id ?? i} $role={m.role as 'user' | 'assistant'}>
              {content}
            </MessageBubble>
          );
        })}
        
        {isLoading && (
          <MessageBubble $role="assistant">
            <em>Pensando...</em>
          </MessageBubble>
        )}
        
        {error && (
          <div style={{ color: '#ef4444', fontSize: '0.875rem', padding: '1rem', border: '1px solid #ef4444', borderRadius: '8px', marginTop: '0.5rem' }}>
            <strong>Error:</strong> {error.message || 'An unknown error occurred while communicating with the AI.'}
          </div>
        )}
        
        <div ref={endOfMessagesRef} />
      </MessageList>

      <InputForm onSubmit={handleFormSubmit}>
        <ChatInput
          value={localInput}
          onChange={(e) => setLocalInput(e.target.value)}
          placeholder="E.g., I had 3 chicken tacos for lunch..."
          disabled={isLoading}
        />
        <SendButton type="submit" disabled={isLoading || !localInput.trim()}>
          <Send size={18} />
        </SendButton>
      </InputForm>
    </ChatContainer>
  );
}
