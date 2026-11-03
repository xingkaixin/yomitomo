import { describe, expect, it } from 'vitest';
import { hashText } from '@yomitomo/shared';
import {
  applyDistillationProposalToDraft,
  planDistillationProposalChangeSet,
} from '../annotation-discussion/app-annotation-sedimentation-proposals';

const now = '2026-05-31T06:00:00.000Z';

describe('annotation distillation proposals', () => {
  it('plans grouped proposals when insert content carries the anchor instruction', () => {
    const draft =
      'Agentic Coding的边界之一是隐性知识不在语料库中。作者以ScopeDB开发为例，指出@andylokandy随手指出Rust库或标准库接口、@leiysky随手丢论文和友商文档，以及作者自己“莫名其妙知道的很多诡异的细节”——这些在特定场合能提效十倍以上的知识，AI搜不到、组合不出来。';
    const result = planDistillationProposalChangeSet(
      draft,
      [
        {
          id: 'proposal_insert_examples',
          kind: 'insert',
          status: 'pending',
          title: '补充证据锚点',
          content:
            '在“作者以ScopeDB开发为例”之后，补充具体案例：“例如@andylokandy随手指出Rust库或标准库接口、@leiysky随手丢论文和友商文档。”',
          updatedAt: now,
        },
        {
          id: 'proposal_insert_review',
          kind: 'insert',
          status: 'pending',
          title: '补充推导中间步骤',
          content:
            '在“AI搜不到、组合不出来”之后，补充：“作者认为，由于这些隐性知识缺失，AI实际每段核心代码的产出都需要Review。”',
          updatedAt: now,
        },
        {
          id: 'proposal_replace_quotes',
          kind: 'replace',
          status: 'pending',
          title: '替换诡异细节',
          targetText: '自己莫名其妙知道的很多诡异的细节',
          replacementText: '自己积累的特定领域工具链知识、标准库接口、论文引用等隐性知识',
          updatedAt: now,
        },
      ],
      null,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changeSet.changes).toHaveLength(3);
    expect(result.changeSet.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          proposalId: 'proposal_insert_examples',
          kind: 'insert',
          insertedText: expect.stringContaining('例如@andylokandy随手指出Rust库或标准库接口'),
        }),
        expect.objectContaining({
          proposalId: 'proposal_insert_review',
          kind: 'insert',
          insertedText: expect.stringContaining('AI实际每段核心代码的产出都需要Review'),
        }),
        expect.objectContaining({
          proposalId: 'proposal_replace_quotes',
          kind: 'replace',
          deletedText: '自己“莫名其妙知道的很多诡异的细节”',
        }),
      ]),
    );
  });

  it('rejects grouped proposal changes when their draft ranges conflict', () => {
    const result = planDistillationProposalChangeSet(
      '旧判断需要收敛',
      [
        {
          id: 'proposal_1',
          kind: 'replace',
          status: 'pending',
          title: '修改一',
          targetText: '旧判断',
          replacementText: '新判断',
          updatedAt: now,
        },
        {
          id: 'proposal_2',
          kind: 'delete',
          status: 'pending',
          title: '删除一',
          targetText: '旧判断需要',
          updatedAt: now,
        },
      ],
      null,
    );

    expect(result).toEqual({
      ok: false,
      reason: 'conflicting_changes',
    });
  });

  it('keeps the draft unchanged when a replace target appears multiple times', () => {
    const result = applyDistillationProposalToDraft(
      '判断一。判断二。',
      {
        id: 'proposal_1',
        kind: 'replace',
        status: 'pending',
        title: '修改',
        targetText: '判断',
        replacementText: '结论',
        updatedAt: now,
      },
      null,
    );

    expect(result).toEqual({
      ok: false,
      reason: 'target_ambiguous',
    });
  });

  it('recovers the insertion anchor when a model writes it into content', () => {
    const result = applyDistillationProposalToDraft(
      '第一段。第二段',
      {
        id: 'proposal_1',
        kind: 'insert',
        status: 'pending',
        title: '新增',
        content: '在“第一段”之后，补充：“新增段落。”',
        updatedAt: now,
      },
      null,
    );

    expect(result).toEqual({
      ok: true,
      draft: '第一段。\n新增段落。\n第二段',
      changeOffset: 5,
      changeLength: 5,
    });
  });

  it('does not append insert proposals when the anchor is missing', () => {
    const result = applyDistillationProposalToDraft(
      '第一段',
      {
        id: 'proposal_1',
        kind: 'insert',
        status: 'pending',
        title: '新增',
        insertAfterText: '不存在的段落',
        content: '新增段落',
        updatedAt: now,
      },
      null,
    );

    expect(result).toEqual({
      ok: false,
      reason: 'insert_anchor_not_found',
    });
  });

  it('does not append unanchored insert proposals when the source draft changed', () => {
    const result = applyDistillationProposalToDraft(
      '第一段',
      {
        id: 'proposal_1',
        kind: 'insert',
        status: 'pending',
        title: '新增',
        content: '新增段落',
        sourceDraftHash: hashText('旧草稿'),
        updatedAt: now,
      },
      null,
    );

    expect(result).toEqual({
      ok: false,
      reason: 'insert_anchor_not_found',
    });
  });

  it('does not insert duplicate proposal content', () => {
    const result = applyDistillationProposalToDraft(
      '第一段\n新增段落',
      {
        id: 'proposal_1',
        kind: 'insert',
        status: 'pending',
        title: '新增',
        insertAfterText: '第一段',
        content: '新增 段落',
        updatedAt: now,
      },
      null,
    );

    expect(result).toEqual({
      ok: false,
      reason: 'duplicate_insert',
    });
  });

  it('replaces a proposal target when only quote marks differ', () => {
    const result = applyDistillationProposalToDraft(
      '作者自己“莫名其妙知道的很多诡异的细节”需要收敛',
      {
        id: 'proposal_1',
        kind: 'replace',
        status: 'pending',
        title: '修改',
        targetText: '自己莫名其妙知道的很多诡异的细节',
        replacementText: '自己积累的特定领域知识',
        updatedAt: now,
      },
      null,
    );

    expect(result).toEqual({
      ok: true,
      draft: '作者自己积累的特定领域知识需要收敛',
      changeOffset: 2,
      changeLength: 11,
    });
  });
});
