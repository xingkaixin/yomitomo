import type { UiLanguage } from '@yomitomo/shared';
import enConceptTranslatorWriting from '../assets/agent-writing-animations/en/annotation/concept-translator-writing.webp';
import enInsightEditorWriting from '../assets/agent-writing-animations/en/annotation/insight-editor-writing.webp';
import enQuestionMentorWriting from '../assets/agent-writing-animations/en/annotation/question-mentor-writing.webp';
import enReadingPartnerWriting from '../assets/agent-writing-animations/en/annotation/reading-partner-writing.webp';
import enRootReviewerWriting from '../assets/agent-writing-animations/en/annotation/root-reviewer-writing.webp';
import enStructureNavigatorWriting from '../assets/agent-writing-animations/en/annotation/structure-navigator-writing.webp';
import zhConceptTranslatorWriting from '../assets/agent-writing-animations/zh-CN/annotation/concept-translator-writing.webp';
import zhInsightEditorWriting from '../assets/agent-writing-animations/zh-CN/annotation/insight-editor-writing.webp';
import zhQuestionMentorWriting from '../assets/agent-writing-animations/zh-CN/annotation/question-mentor-writing.webp';
import zhReadingPartnerWriting from '../assets/agent-writing-animations/zh-CN/annotation/reading-partner-writing.webp';
import zhRootReviewerWriting from '../assets/agent-writing-animations/zh-CN/annotation/root-reviewer-writing.webp';
import zhStructureNavigatorWriting from '../assets/agent-writing-animations/zh-CN/annotation/structure-navigator-writing.webp';

type AgentWritingAnimationAsset = {
  frameCount: number;
  frameHeight: number;
  frameWidth: number;
  sprite: string;
};

const framesPerSecond = 6;
const zhAnnotationWritingAnimations: Record<string, AgentWritingAnimationAsset> = {
  'reading-partner': writingAnimation(zhReadingPartnerWriting),
  'root-reviewer': writingAnimation(zhRootReviewerWriting),
  'question-mentor': writingAnimation(zhQuestionMentorWriting),
  'insight-editor': writingAnimation(zhInsightEditorWriting),
  'concept-translator': writingAnimation(zhConceptTranslatorWriting),
  'structure-navigator': writingAnimation(zhStructureNavigatorWriting),
};

const enAnnotationWritingAnimations: Record<string, AgentWritingAnimationAsset> = {
  'reading-partner': writingAnimation(enReadingPartnerWriting),
  'root-reviewer': writingAnimation(enRootReviewerWriting),
  'question-mentor': writingAnimation(enQuestionMentorWriting),
  'insight-editor': writingAnimation(enInsightEditorWriting),
  'concept-translator': writingAnimation(enConceptTranslatorWriting),
  'structure-navigator': writingAnimation(enStructureNavigatorWriting),
};

const writingAnimationsByLocale: Record<UiLanguage, Record<string, AgentWritingAnimationAsset>> = {
  'zh-CN': zhAnnotationWritingAnimations,
  en: enAnnotationWritingAnimations,
};

export function resolveAgentWritingAnimation(
  locale: UiLanguage,
  presetId: string | undefined,
): AgentWritingAnimationAsset | undefined {
  if (!presetId) return undefined;
  return writingAnimationsByLocale[locale]?.[presetId] || zhAnnotationWritingAnimations[presetId];
}

export function agentWritingAnimationDuration(asset: AgentWritingAnimationAsset) {
  return `${asset.frameCount / framesPerSecond}s`;
}

function writingAnimation(sprite: string): AgentWritingAnimationAsset {
  return {
    frameCount: 7,
    frameHeight: 192,
    frameWidth: 192,
    sprite,
  };
}
