export type AgentAnnotationDensity = 'low' | 'medium' | 'high';

export type AgentReadingIntent = 'explain' | 'decompose' | 'challenge' | 'question' | 'connect';

export type AgentKind = 'annotation' | 'review';

export type AgentPersonality = {
  id: string;
  kind: AgentKind;
  name: string;
  pinyin?: string;
  roleTitle: string;
  gender: 'female' | 'male';
  description: string;
  introduction: string;
  selfIntroduction?: string;
  sceneDescription: string;
  portraitPrompt: string;
  scenePrompt: string;
  icon: 'leaf' | 'pyramid' | 'question' | 'quill' | 'lens' | 'scales' | 'checklist';
  temperature: number;
  defaultColor: string;
  defaultEnabled: boolean;
  soul: string;
};

export type Agent = {
  id: string;
  kind: AgentKind;
  presetId?: string;
  enabled: boolean;
  providerId: string;
  nickname: string;
  username: string;
  avatar: string;
  annotationColor: string;
  annotationDensity: AgentAnnotationDensity;
  temperature: number;
  soul: string;
  createdAt: string;
  updatedAt: string;
};

export type PublicAgent = Omit<Agent, 'providerId' | 'soul' | 'createdAt' | 'updatedAt'> & {
  personalityName: string;
  pinyin?: string;
};
