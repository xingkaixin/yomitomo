import { createContext, useContext } from 'react';
import type { Agent, LandingContent } from './data/article';

const LandingContext = createContext<LandingContent | null>(null);

export const LandingProvider = LandingContext.Provider;

export function useLanding(): LandingContent {
  const ctx = useContext(LandingContext);
  if (!ctx) throw new Error('useLanding must be used within a LandingProvider');
  return ctx;
}

/** Returns a resolver that maps an agent id to its Agent for the active locale. */
export function useAgentResolver(): (id: string) => Agent {
  const { agents } = useLanding();
  return (id: string) => agents.find((a) => a.id === id) ?? agents[0];
}
