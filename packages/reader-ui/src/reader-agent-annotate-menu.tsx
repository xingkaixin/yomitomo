import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  CircleUserRound,
  MessageSquare,
  MessageSquarePlus,
  Sparkles,
  X,
} from 'lucide-react';
import type {
  AgentReadingPlanItem,
  FocusCoReadingPlan,
  FocusCoReadingSectionPlan,
  MessageSendShortcut,
  PublicAgent,
} from '@yomitomo/shared';
import { makeId } from '@yomitomo/shared';
import { getMentionQuery } from '@yomitomo/core';
import { AvatarBadge, SubmitShortcutKeys } from './reader-component-primitives';
import {
  filterFocusMessagesForAgents,
  focusMessageFromDraft,
  focusMessageTargetAgents,
  focusSectionFromReaderSection,
  focusSectionHasContent,
  focusSectionToReadingPlanItem,
  normalizeFocusSectionPlans,
  uniqueIds,
} from './reader-agent-annotate-utils';
import { matchesAgentMentionQuery, mentionDraftWithAgent } from './reader-mention-utils';
import type { ReaderReadingSection } from './reader-types';
import { isMessageSendShortcutEvent } from './reader-utils';

const coReadingAnalysisPhases = [
  '扫描章节边界',
  '提炼章节主旨',
  '读取助手角色卡',
  '生成分配方案',
] as const;

export function AgentAnnotateMenu({
  articleId,
  agents,
  annotatingAgents,
  focusCoReadingPlan,
  messageSendShortcut,
  readingSections,
  shortcutModifier,
  onCancel,
  onPlanFocusCoReading,
  onSaveFocusCoReadingPlan,
  onStartAgentPlan,
}: {
  articleId: string;
  agents: PublicAgent[];
  annotatingAgents: string[];
  focusCoReadingPlan?: FocusCoReadingPlan;
  messageSendShortcut: MessageSendShortcut;
  readingSections: ReaderReadingSection[];
  shortcutModifier: string;
  onCancel: () => void;
  onPlanFocusCoReading: (selectedAgentIds: string[]) => Promise<FocusCoReadingPlan>;
  onSaveFocusCoReadingPlan: (plan: FocusCoReadingPlan) => void | Promise<void>;
  onStartAgentPlan: (agent: PublicAgent, readingPlan: AgentReadingPlanItem[]) => void;
}) {
  const availableAgents = useMemo(
    () => agents.filter((agent) => !annotatingAgents.includes(agent.id)),
    [agents, annotatingAgents],
  );
  const [expandedSectionIds, setExpandedSectionIds] = useState<string[]>([]);
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [draftPlan, setDraftPlan] = useState<FocusCoReadingPlan | undefined>(focusCoReadingPlan);
  const [sectionPlans, setSectionPlans] = useState<FocusCoReadingSectionPlan[]>([]);
  const [messageDrafts, setMessageDrafts] = useState<Record<string, string>>({});
  const [messageCaretIndexes, setMessageCaretIndexes] = useState<Record<string, number>>({});
  const [selectedFocusMentionIndex, setSelectedFocusMentionIndex] = useState(0);
  const [planning, setPlanning] = useState(false);
  const [planningProgress, setPlanningProgress] = useState(0);
  const [planError, setPlanError] = useState('');
  const [addingPlanAgents, setAddingPlanAgents] = useState(false);
  const [addingSectionId, setAddingSectionId] = useState<string | null>(null);
  const focusMessageTextareaRefs = useRef(new Map<string, HTMLTextAreaElement>());

  useEffect(() => {
    if (!addingPlanAgents && !addingSectionId) return;

    function closeAddMenusOnPointerDown(event: PointerEvent) {
      const clickedAddMenu = event
        .composedPath()
        .some(
          (target) =>
            target instanceof HTMLElement && target.classList.contains('reader-focus-add-wrap'),
        );
      if (clickedAddMenu) return;
      setAddingPlanAgents(false);
      setAddingSectionId(null);
    }

    window.addEventListener('pointerdown', closeAddMenusOnPointerDown, true);
    return () => window.removeEventListener('pointerdown', closeAddMenusOnPointerDown, true);
  }, [addingPlanAgents, addingSectionId]);

  useEffect(() => {
    const saved = focusCoReadingPlan?.selectedAgentIds.filter((id) =>
      availableAgents.some((agent) => agent.id === id),
    );
    setSelectedAgentIds(saved && saved.length > 0 ? saved : []);
  }, [articleId, availableAgents, focusCoReadingPlan?.selectedAgentIds]);

  useEffect(() => {
    setExpandedSectionIds((ids) => {
      const nextIds = ids.filter((id) => readingSections.some((section) => section.id === id));
      return nextIds.length === ids.length ? ids : nextIds;
    });
  }, [readingSections]);

  useEffect(() => {
    setSectionPlans(
      normalizeFocusSectionPlans(focusCoReadingPlan?.sections, readingSections, availableAgents),
    );
    setDraftPlan(focusCoReadingPlan);
  }, [availableAgents, focusCoReadingPlan, readingSections]);

  const sectionPlansById = useMemo(
    () => new Map(sectionPlans.map((section) => [section.sectionId, section])),
    [sectionPlans],
  );
  const selectedRouteAgents = availableAgents.filter((agent) =>
    selectedAgentIds.includes(agent.id),
  );
  const addablePlanAgents = availableAgents.filter((agent) => !selectedAgentIds.includes(agent.id));
  const assignedAgentIds = new Set(sectionPlans.flatMap((section) => section.agentIds));
  const assignedAgentCount = assignedAgentIds.size;
  const plannedSectionCount = sectionPlans.filter((section) => section.agentIds.length > 0).length;
  const canPlan = selectedAgentIds.length > 0 && readingSections.length > 0 && !planning;
  const canStart = plannedSectionCount > 0 && assignedAgentCount > 0;
  const planningPhaseIndex = Math.min(
    coReadingAnalysisPhases.length - 1,
    Math.floor((planningProgress / 100) * coReadingAnalysisPhases.length),
  );

  useEffect(() => {
    if (!planning) return;
    const interval = window.setInterval(() => {
      setPlanningProgress((progress) => Math.min(88, progress + 4));
    }, 420);
    return () => window.clearInterval(interval);
  }, [planning]);

  function addPlanAgent(agentId: string) {
    if (selectedAgentIds.includes(agentId)) return;
    saveSections(sectionPlans, uniqueIds([...selectedAgentIds, agentId]));
  }

  function togglePlanAddMenu() {
    setAddingSectionId(null);
    setAddingPlanAgents((open) => !open);
  }

  function toggleSectionAddMenu(sectionId: string) {
    setAddingPlanAgents(false);
    setAddingSectionId((openId) => (openId === sectionId ? null : sectionId));
  }

  function closePlanAddMenuOnBlur(event: React.FocusEvent<HTMLDivElement>) {
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) {
      return;
    }
    setAddingPlanAgents(false);
  }

  function closeSectionAddMenuOnBlur(event: React.FocusEvent<HTMLDivElement>, sectionId: string) {
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) {
      return;
    }
    setAddingSectionId((openId) => (openId === sectionId ? null : openId));
  }

  function removePlanAgent(agentId: string) {
    const nextIds = selectedAgentIds.filter((id) => id !== agentId);
    const nextSections = sectionPlans.map((section) => {
      const agentIds = section.agentIds.filter((id) => id !== agentId);
      return {
        ...section,
        agentIds,
        messages: filterFocusMessagesForAgents(section.messages, agentIds),
      };
    });
    saveSections(nextSections, nextIds);
  }

  async function planCoReading() {
    if (!canPlan) return;
    setPlanning(true);
    setPlanningProgress(6);
    setPlanError('');
    try {
      const plan = await onPlanFocusCoReading(selectedAgentIds);
      const nextSections = normalizeFocusSectionPlans(
        plan.sections,
        readingSections,
        availableAgents,
      );
      setDraftPlan(plan);
      setSectionPlans(nextSections);
      setPlanningProgress(100);
    } catch (error) {
      setPlanError(error instanceof Error ? error.message : '共读规划失败');
      setPlanningProgress(100);
    } finally {
      window.setTimeout(() => setPlanning(false), 520);
    }
  }

  function saveSections(
    nextSections: FocusCoReadingSectionPlan[],
    nextSelectedAgentIds = selectedAgentIds,
  ) {
    const now = new Date().toISOString();
    const basePlan = draftPlan || focusCoReadingPlan;
    const normalizedSections = normalizeFocusSectionPlans(
      nextSections,
      readingSections,
      availableAgents,
    ).filter(focusSectionHasContent);
    const plan: FocusCoReadingPlan = {
      id: basePlan?.id || makeId('focus_co_reading'),
      articleId,
      selectedAgentIds: uniqueIds([
        ...nextSelectedAgentIds,
        ...normalizedSections.flatMap((section) => section.agentIds),
      ]),
      sections: normalizedSections,
      readingMemory: basePlan?.readingMemory,
      createdAt: basePlan?.createdAt || now,
      updatedAt: now,
    };
    setDraftPlan(plan);
    setSelectedAgentIds(plan.selectedAgentIds);
    setSectionPlans(normalizeFocusSectionPlans(plan.sections, readingSections, availableAgents));
    void Promise.resolve(onSaveFocusCoReadingPlan(plan)).catch((error) => {
      setPlanError(error instanceof Error ? error.message : '共读方案保存失败');
    });
  }

  function updateSection(
    sectionId: string,
    update: (section: FocusCoReadingSectionPlan) => FocusCoReadingSectionPlan,
  ) {
    const readerSection = readingSections.find((section) => section.id === sectionId);
    if (!readerSection) return;
    const current = sectionPlansById.get(sectionId) || focusSectionFromReaderSection(readerSection);
    const nextSection = update(current);
    const nextSectionsById = new Map(sectionPlans.map((section) => [section.sectionId, section]));
    if (focusSectionHasContent(nextSection)) nextSectionsById.set(sectionId, nextSection);
    else nextSectionsById.delete(sectionId);
    const nextSections = readingSections.flatMap((section) => {
      const plan = nextSectionsById.get(section.id);
      return plan ? [plan] : [];
    });
    saveSections(nextSections);
  }

  function addSectionAgent(sectionId: string, agentId: string) {
    updateSection(sectionId, (section) => ({
      ...section,
      agentIds: uniqueIds([...section.agentIds, agentId]),
    }));
  }

  function toggleSectionExpanded(sectionId: string) {
    setExpandedSectionIds((ids) =>
      ids.includes(sectionId) ? ids.filter((id) => id !== sectionId) : [...ids, sectionId],
    );
  }

  function removeSectionAgent(sectionId: string, agentId: string) {
    updateSection(sectionId, (section) => {
      const agentIds = section.agentIds.filter((id) => id !== agentId);
      return {
        ...section,
        agentIds,
        messages: filterFocusMessagesForAgents(section.messages, agentIds),
      };
    });
  }

  function addSectionMessage(sectionId: string) {
    const content = messageDrafts[sectionId]?.trim();
    if (!content) return;
    updateSection(sectionId, (section) => ({
      ...section,
      messages: [...section.messages, focusMessageFromDraft(content, section, availableAgents)],
    }));
    setMessageDrafts((drafts) => ({ ...drafts, [sectionId]: '' }));
  }

  function updateFocusMessageDraft(sectionId: string, value: string) {
    setMessageDrafts((drafts) => ({
      ...drafts,
      [sectionId]: value,
    }));
  }

  function updateFocusMessageCaret(sectionId: string, element: HTMLTextAreaElement) {
    setMessageCaretIndexes((indexes) => ({
      ...indexes,
      [sectionId]: element.selectionStart,
    }));
  }

  function getFocusMentionQuery(sectionId: string) {
    return getMentionQuery(messageDrafts[sectionId] || '', messageCaretIndexes[sectionId] || 0);
  }

  function matchedFocusMentionAgents(sectionId: string, sectionAgents: PublicAgent[]) {
    const mentionQuery = getFocusMentionQuery(sectionId);
    if (!mentionQuery) return [];
    return sectionAgents
      .filter((agent) => matchesAgentMentionQuery(agent, mentionQuery.query))
      .slice(0, 5);
  }

  function setFocusMessageTextarea(sectionId: string, element: HTMLTextAreaElement | null) {
    if (element) focusMessageTextareaRefs.current.set(sectionId, element);
    else focusMessageTextareaRefs.current.delete(sectionId);
  }

  function insertFocusMessageMention(
    sectionId: string,
    agent: PublicAgent,
    mentionQuery = getFocusMentionQuery(sectionId),
  ) {
    let nextCaretIndex = 0;
    setMessageDrafts((drafts) => {
      const next = mentionDraftWithAgent(drafts[sectionId] || '', agent.nickname, mentionQuery);
      nextCaretIndex = next.caretIndex;
      return {
        ...drafts,
        [sectionId]: next.content,
      };
    });
    setSelectedFocusMentionIndex(0);
    requestAnimationFrame(() => {
      const textarea = focusMessageTextareaRefs.current.get(sectionId);
      textarea?.focus();
      textarea?.setSelectionRange(nextCaretIndex, nextCaretIndex);
      if (textarea) updateFocusMessageCaret(sectionId, textarea);
    });
  }

  function handleFocusMessageKeyDown(
    event: React.KeyboardEvent<HTMLTextAreaElement>,
    sectionId: string,
    matchedAgents: PublicAgent[],
  ) {
    if (matchedAgents.length > 0 && event.key === 'ArrowDown') {
      event.preventDefault();
      setSelectedFocusMentionIndex((index) => (index + 1) % matchedAgents.length);
      return;
    }

    if (matchedAgents.length > 0 && event.key === 'ArrowUp') {
      event.preventDefault();
      setSelectedFocusMentionIndex(
        (index) => (index - 1 + matchedAgents.length) % matchedAgents.length,
      );
      return;
    }

    if (matchedAgents.length > 0 && event.key === 'Tab') {
      event.preventDefault();
      insertFocusMessageMention(
        sectionId,
        matchedAgents[selectedFocusMentionIndex] || matchedAgents[0],
      );
      return;
    }

    if (isMessageSendShortcutEvent(event, messageSendShortcut)) {
      event.preventDefault();
      addSectionMessage(sectionId);
    }
  }

  function removeSectionMessage(sectionId: string, messageId: string) {
    updateSection(sectionId, (section) => ({
      ...section,
      messages: section.messages.filter((message) => message.id !== messageId),
    }));
  }

  function startReadingPlan() {
    if (!canStart) return;

    for (const agent of availableAgents) {
      const readingPlan = sectionPlans.flatMap((section) =>
        section.agentIds.includes(agent.id) ? [focusSectionToReadingPlanItem(section, agent)] : [],
      );
      if (readingPlan.length > 0) onStartAgentPlan(agent, readingPlan);
    }

    onCancel();
  }

  return (
    <div className="reader-agent-annotate-menu">
      <header className="reader-plan-header">
        <div>
          <strong>聚焦共读</strong>
          <span>按章节规划助手参与和读者留言，再一起进入批注流</span>
        </div>
        <p>
          <b>{assignedAgentCount}</b> 助手 · <b>{plannedSectionCount}</b> 章节
        </p>
      </header>

      <div className="reader-focus-toolbar">
        <div className="reader-focus-agent-picker" aria-label="参与规划的助手">
          <div className="reader-focus-add-wrap" onBlur={closePlanAddMenuOnBlur}>
            <button
              className="reader-focus-add"
              type="button"
              aria-expanded={addingPlanAgents}
              onClick={togglePlanAddMenu}
            >
              <CircleUserRound size={16} />
              <strong>添加助手</strong>
            </button>
            {addingPlanAgents ? (
              <div className="reader-focus-add-menu">
                {addablePlanAgents.length > 0 ? (
                  addablePlanAgents.map((agent) => (
                    <button key={agent.id} type="button" onClick={() => addPlanAgent(agent.id)}>
                      <AvatarBadge avatar={agent.avatar} fallback={agent.nickname.slice(0, 1)} />
                      <strong>{agent.nickname}</strong>
                    </button>
                  ))
                ) : (
                  <em>暂无可添加助手</em>
                )}
              </div>
            ) : null}
          </div>
          {selectedRouteAgents.map((agent) => (
            <button
              className="reader-focus-agent-chip"
              key={agent.id}
              type="button"
              onClick={() => removePlanAgent(agent.id)}
            >
              <AvatarBadge avatar={agent.avatar} fallback={agent.nickname.slice(0, 1)} />
              <strong>{agent.nickname}</strong>
              <X size={13} />
            </button>
          ))}
        </div>
        <button
          className="reader-focus-plan"
          disabled={!canPlan}
          type="button"
          onClick={planCoReading}
        >
          <Sparkles size={15} />
          {planning ? coReadingAnalysisPhases[planningPhaseIndex] : '开始分析文章'}
        </button>
      </div>
      {planning ? (
        <div className="reader-focus-progress">
          <div>
            <strong>{coReadingAnalysisPhases[planningPhaseIndex]}</strong>
            <span>{Math.round(planningProgress)}%</span>
          </div>
          <i>
            <b style={{ width: `${planningProgress}%` }} />
          </i>
        </div>
      ) : null}

      {readingSections.length > 0 ? (
        <section className="reader-focus-card-list" aria-label="共读章节">
          {readingSections.map((section, index) => {
            const plan = sectionPlansById.get(section.id) || focusSectionFromReaderSection(section);
            const sectionAgents = availableAgents.filter((agent) =>
              plan.agentIds.includes(agent.id),
            );
            const addableSectionAgents = availableAgents.filter(
              (agent) => !plan.agentIds.includes(agent.id),
            );
            const mentionAgents = matchedFocusMentionAgents(section.id, sectionAgents);
            const expanded = expandedSectionIds.includes(section.id);
            return (
              <article
                className={`reader-focus-section-card${expanded ? ' is-open' : ''}`}
                key={section.id}
              >
                <button
                  className="reader-focus-card-summary"
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => toggleSectionExpanded(section.id)}
                >
                  <b>§{index + 1}</b>
                  <div className="reader-focus-card-copy">
                    <div className="reader-focus-card-title">
                      <strong>{section.title}</strong>
                      {plan.tag ? <em>{plan.tag}</em> : null}
                    </div>
                    <small>{plan.summary || '展开后可手动安排助手和留言'}</small>
                  </div>
                  <div className="reader-focus-card-agents">
                    {plan.messages.length > 0 ? (
                      <small className="reader-focus-message-count">
                        {plan.messages.length} 条留言
                      </small>
                    ) : null}
                    {sectionAgents.length > 0 ? (
                      sectionAgents.map((agent) => (
                        <i key={agent.id}>
                          <AvatarBadge
                            avatar={agent.avatar}
                            fallback={agent.nickname.slice(0, 1)}
                          />
                          <strong>{agent.nickname}</strong>
                        </i>
                      ))
                    ) : (
                      <small>未分配</small>
                    )}
                  </div>
                  {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>

                {expanded ? (
                  <div className="reader-focus-card-body">
                    <div className="reader-focus-card-section">
                      <strong>已分配助手</strong>
                      <div className="reader-focus-assigned-list">
                        <div
                          className="reader-focus-add-wrap"
                          onBlur={(event) => closeSectionAddMenuOnBlur(event, section.id)}
                        >
                          <button
                            className="reader-focus-add"
                            type="button"
                            aria-expanded={addingSectionId === section.id}
                            onClick={() => toggleSectionAddMenu(section.id)}
                          >
                            <CircleUserRound size={16} />
                            <strong>添加助手</strong>
                          </button>
                          {addingSectionId === section.id ? (
                            <div className="reader-focus-add-menu">
                              {addableSectionAgents.length > 0 ? (
                                addableSectionAgents.map((agent) => (
                                  <button
                                    key={agent.id}
                                    type="button"
                                    onClick={() => addSectionAgent(section.id, agent.id)}
                                  >
                                    <AvatarBadge
                                      avatar={agent.avatar}
                                      fallback={agent.nickname.slice(0, 1)}
                                    />
                                    <strong>{agent.nickname}</strong>
                                  </button>
                                ))
                              ) : (
                                <em>暂无可添加助手</em>
                              )}
                            </div>
                          ) : null}
                        </div>
                        {sectionAgents.map((agent) => (
                          <button
                            className="reader-focus-assigned-chip"
                            key={agent.id}
                            type="button"
                            onClick={() => removeSectionAgent(section.id, agent.id)}
                          >
                            <AvatarBadge
                              avatar={agent.avatar}
                              fallback={agent.nickname.slice(0, 1)}
                            />
                            <strong>{agent.nickname}</strong>
                            <X size={13} />
                          </button>
                        ))}
                      </div>
                    </div>

                    {plan.messages.length > 0 ? (
                      <div className="reader-focus-messages">
                        {plan.messages.map((message) => {
                          const targets = focusMessageTargetAgents(message, availableAgents);
                          return (
                            <div className="reader-focus-message" key={message.id}>
                              <MessageSquare size={14} />
                              <div className="reader-focus-message-body">
                                <p>{message.content}</p>
                                <div className="reader-focus-message-targets">
                                  {targets.length > 0 ? (
                                    targets.map((target) => (
                                      <em key={target.id || target.nickname}>@{target.nickname}</em>
                                    ))
                                  ) : (
                                    <em>全局留言</em>
                                  )}
                                </div>
                              </div>
                              <button
                                type="button"
                                aria-label="删除留言"
                                onClick={() => removeSectionMessage(section.id, message.id)}
                              >
                                <X size={13} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    ) : null}

                    <div className="reader-focus-message-input">
                      <div className="reader-focus-message-box">
                        <textarea
                          ref={(element) => setFocusMessageTextarea(section.id, element)}
                          disabled={sectionAgents.length === 0}
                          value={messageDrafts[section.id] || ''}
                          placeholder={
                            sectionAgents.length > 0
                              ? '给助手留言，或 @ 指定助手…'
                              : '添加助手后可留言'
                          }
                          onChange={(event) => {
                            updateFocusMessageDraft(section.id, event.currentTarget.value);
                            updateFocusMessageCaret(section.id, event.currentTarget);
                          }}
                          onClick={(event) =>
                            updateFocusMessageCaret(section.id, event.currentTarget)
                          }
                          onKeyDown={(event) =>
                            handleFocusMessageKeyDown(event, section.id, mentionAgents)
                          }
                          onKeyUp={(event) =>
                            updateFocusMessageCaret(section.id, event.currentTarget)
                          }
                          onSelect={(event) =>
                            updateFocusMessageCaret(section.id, event.currentTarget)
                          }
                        />
                        {mentionAgents.length > 0 ? (
                          <div className="reader-agent-menu reader-focus-agent-menu">
                            {mentionAgents.map((agent, mentionIndex) => (
                              <button
                                className={
                                  mentionIndex === selectedFocusMentionIndex ? 'is-active' : ''
                                }
                                key={agent.id}
                                type="button"
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => insertFocusMessageMention(section.id, agent)}
                              >
                                <AvatarBadge
                                  avatar={agent.avatar}
                                  fallback={agent.nickname.slice(0, 1)}
                                />
                                <strong>{agent.nickname}</strong>
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <div className="reader-focus-message-footer">
                        <div className="reader-focus-message-agents">
                          <small>可 @ 的助手：</small>
                          {sectionAgents.map((agent) => (
                            <button
                              key={agent.id}
                              type="button"
                              onClick={() => insertFocusMessageMention(section.id, agent)}
                            >
                              <AvatarBadge
                                avatar={agent.avatar}
                                fallback={agent.nickname.slice(0, 1)}
                              />
                              <strong>{agent.nickname}</strong>
                            </button>
                          ))}
                        </div>
                        <button
                          type="button"
                          disabled={sectionAgents.length === 0}
                          onClick={() => addSectionMessage(section.id)}
                        >
                          <SubmitShortcutKeys
                            shortcut={messageSendShortcut}
                            shortcutModifier={shortcutModifier}
                          />
                          <MessageSquarePlus size={15} />
                          留言
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </section>
      ) : (
        <div className="reader-focus-empty">当前文章缺少可规划章节</div>
      )}

      <div className="reader-plan-footer">
        <p className="reader-plan-help">
          {planError || `${selectedAgentIds.length} 位助手已加入规划`}
        </p>
        <div className="reader-agent-annotate-actions">
          <button type="button" onClick={onCancel}>
            取消
          </button>
          <button disabled={!canStart} type="button" onClick={startReadingPlan}>
            开始共读
          </button>
        </div>
      </div>
    </div>
  );
}
