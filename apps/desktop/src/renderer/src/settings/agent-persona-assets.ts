import type { UiLanguage } from '@yomitomo/shared';
import zhConceptTranslatorCover from '../assets/agent-personas/zh-CN/annotation/concept-translator-cover.webp';
import zhConceptTranslatorAvatar from '../assets/agent-personas/zh-CN/annotation/concept-translator.webp';
import zhInsightEditorCover from '../assets/agent-personas/zh-CN/annotation/insight-editor-cover.webp';
import zhInsightEditorAvatar from '../assets/agent-personas/zh-CN/annotation/insight-editor.webp';
import zhQuestionMentorCover from '../assets/agent-personas/zh-CN/annotation/question-mentor-cover.webp';
import zhQuestionMentorAvatar from '../assets/agent-personas/zh-CN/annotation/question-mentor.webp';
import zhReadingPartnerCover from '../assets/agent-personas/zh-CN/annotation/reading-partner-cover.webp';
import zhReadingPartnerAvatar from '../assets/agent-personas/zh-CN/annotation/reading-partner.webp';
import zhRootReviewerCover from '../assets/agent-personas/zh-CN/annotation/root-reviewer-cover.webp';
import zhRootReviewerAvatar from '../assets/agent-personas/zh-CN/annotation/root-reviewer.webp';
import zhStructureNavigatorCover from '../assets/agent-personas/zh-CN/annotation/structure-navigator-cover.webp';
import zhStructureNavigatorAvatar from '../assets/agent-personas/zh-CN/annotation/structure-navigator.webp';
import zhActionCalibratorCover from '../assets/agent-personas/zh-CN/review/action-calibrator-cover.webp';
import zhActionCalibratorAvatar from '../assets/agent-personas/zh-CN/review/action-calibrator.webp';
import zhEvidenceArchivistCover from '../assets/agent-personas/zh-CN/review/evidence-archivist-cover.webp';
import zhEvidenceArchivistAvatar from '../assets/agent-personas/zh-CN/review/evidence-archivist.webp';
import zhFinalCopyEditorCover from '../assets/agent-personas/zh-CN/review/final-copy-editor-cover.webp';
import zhFinalCopyEditorAvatar from '../assets/agent-personas/zh-CN/review/final-copy-editor.webp';
import zhLogicAuditorCover from '../assets/agent-personas/zh-CN/review/logic-auditor-cover.webp';
import zhLogicAuditorAvatar from '../assets/agent-personas/zh-CN/review/logic-auditor.webp';
import zhReaderAdvocateCover from '../assets/agent-personas/zh-CN/review/reader-advocate-cover.webp';
import zhReaderAdvocateAvatar from '../assets/agent-personas/zh-CN/review/reader-advocate.webp';
import zhRiskExaminerCover from '../assets/agent-personas/zh-CN/review/risk-examiner-cover.webp';
import zhRiskExaminerAvatar from '../assets/agent-personas/zh-CN/review/risk-examiner.webp';
import enConceptTranslatorCover from '../assets/agent-personas/en/annotation/concept-translator-cover.webp';
import enConceptTranslatorAvatar from '../assets/agent-personas/en/annotation/concept-translator.webp';
import enInsightEditorCover from '../assets/agent-personas/en/annotation/insight-editor-cover.webp';
import enInsightEditorAvatar from '../assets/agent-personas/en/annotation/insight-editor.webp';
import enQuestionMentorCover from '../assets/agent-personas/en/annotation/question-mentor-cover.webp';
import enQuestionMentorAvatar from '../assets/agent-personas/en/annotation/question-mentor.webp';
import enReadingPartnerCover from '../assets/agent-personas/en/annotation/reading-partner-cover.webp';
import enReadingPartnerAvatar from '../assets/agent-personas/en/annotation/reading-partner.webp';
import enRootReviewerCover from '../assets/agent-personas/en/annotation/root-reviewer-cover.webp';
import enRootReviewerAvatar from '../assets/agent-personas/en/annotation/root-reviewer.webp';
import enStructureNavigatorCover from '../assets/agent-personas/en/annotation/structure-navigator-cover.webp';
import enStructureNavigatorAvatar from '../assets/agent-personas/en/annotation/structure-navigator.webp';
import enActionCalibratorCover from '../assets/agent-personas/en/review/action-calibrator-cover.webp';
import enActionCalibratorAvatar from '../assets/agent-personas/en/review/action-calibrator.webp';
import enEvidenceArchivistCover from '../assets/agent-personas/en/review/evidence-archivist-cover.webp';
import enEvidenceArchivistAvatar from '../assets/agent-personas/en/review/evidence-archivist.webp';
import enFinalCopyEditorCover from '../assets/agent-personas/en/review/final-copy-editor-cover.webp';
import enFinalCopyEditorAvatar from '../assets/agent-personas/en/review/final-copy-editor.webp';
import enLogicAuditorCover from '../assets/agent-personas/en/review/logic-auditor-cover.webp';
import enLogicAuditorAvatar from '../assets/agent-personas/en/review/logic-auditor.webp';
import enReaderAdvocateCover from '../assets/agent-personas/en/review/reader-advocate-cover.webp';
import enReaderAdvocateAvatar from '../assets/agent-personas/en/review/reader-advocate.webp';
import enRiskExaminerCover from '../assets/agent-personas/en/review/risk-examiner-cover.webp';
import enRiskExaminerAvatar from '../assets/agent-personas/en/review/risk-examiner.webp';

type AgentPersonaAsset = { avatar: string; cover: string };

const zhAssets: Record<string, AgentPersonaAsset> = {
  'reading-partner': { avatar: zhReadingPartnerAvatar, cover: zhReadingPartnerCover },
  'root-reviewer': { avatar: zhRootReviewerAvatar, cover: zhRootReviewerCover },
  'question-mentor': { avatar: zhQuestionMentorAvatar, cover: zhQuestionMentorCover },
  'insight-editor': { avatar: zhInsightEditorAvatar, cover: zhInsightEditorCover },
  'concept-translator': { avatar: zhConceptTranslatorAvatar, cover: zhConceptTranslatorCover },
  'structure-navigator': { avatar: zhStructureNavigatorAvatar, cover: zhStructureNavigatorCover },
  'evidence-archivist': { avatar: zhEvidenceArchivistAvatar, cover: zhEvidenceArchivistCover },
  'reader-advocate': { avatar: zhReaderAdvocateAvatar, cover: zhReaderAdvocateCover },
  'final-copy-editor': { avatar: zhFinalCopyEditorAvatar, cover: zhFinalCopyEditorCover },
  'logic-auditor': { avatar: zhLogicAuditorAvatar, cover: zhLogicAuditorCover },
  'risk-examiner': { avatar: zhRiskExaminerAvatar, cover: zhRiskExaminerCover },
  'action-calibrator': { avatar: zhActionCalibratorAvatar, cover: zhActionCalibratorCover },
};

const enAssets: Record<string, AgentPersonaAsset> = {
  'reading-partner': { avatar: enReadingPartnerAvatar, cover: enReadingPartnerCover },
  'root-reviewer': { avatar: enRootReviewerAvatar, cover: enRootReviewerCover },
  'question-mentor': { avatar: enQuestionMentorAvatar, cover: enQuestionMentorCover },
  'insight-editor': { avatar: enInsightEditorAvatar, cover: enInsightEditorCover },
  'concept-translator': { avatar: enConceptTranslatorAvatar, cover: enConceptTranslatorCover },
  'structure-navigator': { avatar: enStructureNavigatorAvatar, cover: enStructureNavigatorCover },
  'evidence-archivist': { avatar: enEvidenceArchivistAvatar, cover: enEvidenceArchivistCover },
  'reader-advocate': { avatar: enReaderAdvocateAvatar, cover: enReaderAdvocateCover },
  'final-copy-editor': { avatar: enFinalCopyEditorAvatar, cover: enFinalCopyEditorCover },
  'logic-auditor': { avatar: enLogicAuditorAvatar, cover: enLogicAuditorCover },
  'risk-examiner': { avatar: enRiskExaminerAvatar, cover: enRiskExaminerCover },
  'action-calibrator': { avatar: enActionCalibratorAvatar, cover: enActionCalibratorCover },
};

const assetsByLocale: Record<UiLanguage, Record<string, AgentPersonaAsset>> = {
  'zh-CN': zhAssets,
  en: enAssets,
};

export function resolveAgentPersonaAssets(
  locale: UiLanguage,
  personalityId: string | undefined,
): AgentPersonaAsset | undefined {
  if (!personalityId) return undefined;
  return assetsByLocale[locale]?.[personalityId] || assetsByLocale['zh-CN'][personalityId];
}
