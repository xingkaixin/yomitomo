import React, { useMemo, useState } from 'react';
import { ArrowRight, Bot, Check, KeyRound, Upload, User } from 'lucide-react';
import type {
  AppSettings,
  ArticleRecord,
  DesktopStore,
  LlmProvider,
  UserProfile,
} from '@yomitomo/shared';
import { hashText } from '@yomitomo/shared';
import { sanitizeUsernameInput, type ProviderDraft, type UserDraft } from './app-settings';
import { ProviderForm } from './app-settings-panels';
import { AvatarImage } from './app-ui';
import { readFileAsDataUrl } from './app-utils';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import chenYanshuCover from './assets/agent-profiles/chen-yanshu-cover.webp';
import guXingjianCover from './assets/agent-profiles/gu-xingjian-cover.webp';
import linZhiweiCover from './assets/agent-profiles/lin-zhiwei-cover.webp';
import shenQingyuanPortrait from './assets/agent-profiles/shen-qingyuan.webp';
import xuWenquCover from './assets/agent-profiles/xu-wenqu-cover.webp';
import zhouYanCover from './assets/agent-profiles/zhou-yan-cover.webp';
import annotatedPageImage from './assets/onboarding/annotated-page.webp';
import readingCompanionImage from './assets/onboarding/reading-companion.webp';
import readerDeskImage from './assets/onboarding/reader-desk.webp';
import readerWindowImage from './assets/onboarding/reader-window.webp';
import readingNotesImage from './assets/onboarding/reading-notes.webp';
import heMinghengCover from './assets/reviewer-profiles/he-mingheng-cover.webp';
import liangZhengyanCover from './assets/reviewer-profiles/liang-zhengyan-cover.webp';
import suDingbaiCover from './assets/reviewer-profiles/su-dingbai-cover.webp';
import tangJianCover from './assets/reviewer-profiles/tang-jian-cover.webp';
import xiaGuiningCover from './assets/reviewer-profiles/xia-guining-cover.webp';
import yeTinglanCover from './assets/reviewer-profiles/ye-tinglan-cover.webp';
import yomitomoLogo from '../../../resources/icon.png';

type OnboardingStep = 'welcome' | 'profile' | 'model' | 'article';

type OnboardingArticle = {
  id: string;
  title: string;
  label: string;
  readingTime: string;
  assistant: string;
  excerpt: string;
  contentHtml: string;
};

const onboardingSteps: Array<{ id: OnboardingStep; label: string }> = [
  { id: 'welcome', label: '开始' },
  { id: 'profile', label: '身份' },
  { id: 'model', label: '模型' },
  { id: 'article', label: '文章' },
];

const onboardingProviderDraft: ProviderDraft = {
  name: '',
  type: 'openai-chat',
  baseUrl: '',
  modelName: '',
  modelNames: [],
  modelInputMode: 'list',
  apiKey: '',
  reasoningEffort: 'none',
};

const onboardingAssistantVisuals = [
  { name: '林知微', image: linZhiweiCover, variant: 'work' },
  { name: '周砚', image: zhouYanCover, variant: 'work' },
  { name: '许问渠', image: xuWenquCover, variant: 'work' },
  { name: '陈砚书', image: chenYanshuCover, variant: 'work' },
  { name: '顾行简', image: guXingjianCover, variant: 'work' },
  { name: '沈清源', image: shenQingyuanPortrait, variant: 'avatar' },
  { name: '梁证言', image: liangZhengyanCover, variant: 'work' },
  { name: '叶听澜', image: yeTinglanCover, variant: 'work' },
  { name: '唐简', image: tangJianCover, variant: 'work' },
  { name: '何明衡', image: heMinghengCover, variant: 'work' },
  { name: '苏定白', image: suDingbaiCover, variant: 'work' },
  { name: '夏归宁', image: xiaGuiningCover, variant: 'work' },
];

const onboardingArticles: OnboardingArticle[] = [
  {
    id: 'onboarding_policy_memo',
    label: '政策 / 制度',
    readingTime: '4 分钟',
    assistant: '周砚',
    title: '一份城市公共数据开放备忘录',
    excerpt: '用一份短备忘录展示前提、边界、受益者和执行风险如何被批注出来。',
    contentHtml: `
      <article>
        <h1>一份城市公共数据开放备忘录</h1>
        <p>城市管理部门计划开放一批低敏公共数据，包括公交到站、道路施工、公共停车位余量和便民服务网点。政策目标是让创业团队、研究机构和社区组织更容易做出有用工具。</p>
        <p>第一阶段只开放已经脱敏、已经在多个部门内部共享的数据。开放范围排除个人轨迹、执法记录原文和能够反推出个人身份的组合数据。每个数据集都需要附带更新频率、字段解释和责任部门。</p>
        <p>这项政策的关键难点在于建立一个可持续的维护机制。过期数据会比数据空白更容易误导使用者。公交到站和停车位数据尤其依赖实时性，责任部门需要对延迟范围给出明确承诺。</p>
        <p>备忘录建议采用“申请使用 + 公开目录”的混合模式。普通访问可以直接读取公开目录；高频调用、批量下载和商业化使用需要登记应用场景。登记用于发现异常请求、追踪服务负载和评估公共价值。</p>
        <p>如果试点成功，第二阶段可以开放更多跨部门主题数据，例如无障碍设施、社区养老服务和公共文化活动。但每一次扩容都应该先回答三个问题：谁会因此做出更好的服务，谁承担数据维护成本，出现错误时谁负责纠正。</p>
      </article>
    `,
  },
  {
    id: 'onboarding_product_reading',
    label: '产品 / 工作',
    readingTime: '3 分钟',
    assistant: '林知微',
    title: '为什么小产品需要阅读现场',
    excerpt: '适合快速体验个人批注、AI 页边批注和在评论里 @ 助手。',
    contentHtml: `
      <article>
        <h1>为什么小产品需要阅读现场</h1>
        <p>很多阅读工具把重点放在收藏、同步和稍后读，但用户真正产生理解的位置通常发生在阅读现场。那一刻用户看到一句话，产生一个问题，想把它和自己的经验接上。</p>
        <p>如果工具只保存整篇文章，用户下次回来仍然要重新找到当时触发思考的那一句。批注的价值在于缩短这段回访路径：它把原文、当时的想法和后续讨论绑定在同一个位置。</p>
        <p>AI 助手适合进入这个现场，但它的角色应该保持克制。它可以解释一个概念、指出一个前提、提出一个问题，也可以在用户 @ 它时继续讨论。它的最佳状态是补上读者暂时缺少的视角。</p>
        <p>因此，一个小而完整的阅读闭环可以很简单：用户选中一句话写下批注，助手在页边补充若干观察，用户在某条批注下继续追问。这个闭环一旦成立，收藏和读后笔记才有了更稳定的来源。</p>
      </article>
    `,
  },
  {
    id: 'onboarding_deep_view',
    label: '观点 / 深读',
    readingTime: '5 分钟',
    assistant: '许问渠',
    title: '把复杂任务拆成可回访的问题',
    excerpt: '围绕一个观点短文练习追问、拆解和后续讨论。',
    contentHtml: `
      <article>
        <h1>把复杂任务拆成可回访的问题</h1>
        <p>复杂任务常常让人误以为自己缺少执行力。更常见的情况是，任务被描述成一个过大的名词，比如“做增长”“提升体验”“研究市场”。这些名词看起来清楚，实际隐藏了很多尚未回答的问题。</p>
        <p>一个可执行的问题需要同时包含对象、判断标准和下一步动作。“提升体验”可以被拆成：新用户在哪个步骤停下，停下时缺少什么信息，我们能用哪一个改动验证这个判断。</p>
        <p>问题拆小以后，任务会获得可回访性。团队下周回来时，可以检查问题是否已经被回答，证据是否变强，下一步是否仍然成立。缺少问题链的任务，会依赖会议记忆和个人感觉继续推进。</p>
        <p>阅读也有同样的结构。读者在文章里留下的问题越具体，后续讨论越容易继续。一个好的批注会把当前理解停在一个可以再次打开的位置。</p>
      </article>
    `,
  },
];

export function OnboardingFlow({
  store,
  onOpenArticle,
  onSaveArticle,
  onSaveProvider,
  onSaveSettings,
  onSaveUser,
  onTestProvider,
}: {
  store: DesktopStore;
  onOpenArticle: (articleId: string) => void;
  onSaveArticle: (article: ArticleRecord) => Promise<DesktopStore>;
  onSaveProvider: (provider: Partial<LlmProvider>) => Promise<DesktopStore>;
  onSaveSettings: (settings: AppSettings) => Promise<DesktopStore>;
  onSaveUser: (user: Partial<UserProfile>) => Promise<DesktopStore>;
  onTestProvider: (id: string) => Promise<{ ok: boolean; message: string }>;
}) {
  const [step, setStep] = useState<OnboardingStep>('welcome');
  const [profileDraft, setProfileDraft] = useState<UserDraft>(() => ({
    ...store.user,
    username: store.user.username === 'me' ? '' : store.user.username,
  }));
  const [providerDraft, setProviderDraft] = useState<ProviderDraft>(onboardingProviderDraft);
  const [selectedArticleId, setSelectedArticleId] = useState(onboardingArticles[0]!.id);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const activeStepIndex = onboardingSteps.findIndex((item) => item.id === step);
  const selectedArticle = useMemo(
    () => onboardingArticles.find((article) => article.id === selectedArticleId)!,
    [selectedArticleId],
  );
  const nickname = profileDraft.nickname?.trim() || '';
  const username = profileDraft.username?.trim() || nickname;
  const canContinueProfile = nickname.length > 0;
  const canContinueModel = Boolean(
    providerDraft.name?.trim() &&
    providerDraft.baseUrl?.trim() &&
    providerDraft.apiKey?.trim() &&
    providerDraft.modelName?.trim(),
  );

  async function skipOnboarding() {
    setBusy(true);
    setStatus('');
    try {
      await onSaveSettings({
        ...store.settings,
        onboardingCompletedAt: new Date().toISOString(),
      });
    } catch (error) {
      setStatus(errorMessage(error, '保存引导状态失败。'));
      setBusy(false);
    }
  }

  async function saveProfile() {
    if (!canContinueProfile) return;
    setBusy(true);
    setStatus('');
    try {
      await onSaveUser({
        nickname,
        username,
        avatar: profileDraft.avatar || '',
        annotationColor: profileDraft.annotationColor || store.user.annotationColor,
      });
      setStep('model');
    } catch (error) {
      setStatus(errorMessage(error, '保存身份失败。'));
    } finally {
      setBusy(false);
    }
  }

  async function saveModel() {
    if (!canContinueModel) return;
    setBusy(true);
    setStatus('正在测试模型连接...');
    try {
      const providerIds = new Set(store.providers.map((provider) => provider.id));
      const nextStore = await onSaveProvider({
        ...providerDraft,
        reasoningEffort: 'none',
      });
      const savedProvider =
        (providerDraft.id
          ? nextStore.providers.find((provider) => provider.id === providerDraft.id)
          : undefined) ||
        nextStore.providers.find((provider) => !providerIds.has(provider.id)) ||
        nextStore.providers.at(-1);
      const providerId = savedProvider?.id || '';

      if (!providerId) throw new Error('请选择模型供应商。');
      const result = await onTestProvider(providerId);
      if (!result.ok) throw new Error(result.message);
      await onSaveSettings({
        ...nextStore.settings,
        defaultProviderId: providerId,
        readingAssistantProviderId: providerId,
        reviewAssistantProviderId: providerId,
        readingNoteProviderId: providerId,
      });
      setStatus('');
      setStep('article');
    } catch (error) {
      setStatus(errorMessage(error, '模型连接失败。'));
    } finally {
      setBusy(false);
    }
  }

  async function completeWithArticle() {
    setBusy(true);
    setStatus('');
    try {
      const article = createOnboardingArticle(selectedArticle);
      const nextStore = await onSaveArticle(article);
      await onSaveSettings({
        ...nextStore.settings,
        onboardingCompletedAt: new Date().toISOString(),
      });
      onOpenArticle(article.id);
    } catch (error) {
      setStatus(errorMessage(error, '保存内置文章失败。'));
      setBusy(false);
    }
  }

  return (
    <section aria-modal="true" className="onboarding-screen" role="dialog">
      <div className="onboarding-rail" aria-label="引导进度">
        <div className="onboarding-brand-mark">
          <img alt="" src={yomitomoLogo} />
        </div>
        <ol>
          {onboardingSteps.map((item, index) => (
            <li
              className={
                index === activeStepIndex
                  ? 'is-active'
                  : index < activeStepIndex
                    ? 'is-complete'
                    : undefined
              }
              key={item.id}
            >
              <span>{index < activeStepIndex ? <Check size={13} /> : index + 1}</span>
              <strong>{item.label}</strong>
            </li>
          ))}
        </ol>
      </div>

      <div className="onboarding-main">
        <header className="onboarding-topbar">
          <div>
            <span>Yomitomo 初次设置</span>
            <h1>把第一篇文章读起来</h1>
          </div>
          <button type="button" disabled={busy} onClick={() => void skipOnboarding()}>
            稍后自己探索
          </button>
        </header>

        {step === 'welcome' ? <OnboardingAssistantBackdrop /> : null}
        <OnboardingVisualCollage step={step} />

        {step === 'welcome' ? (
          <OnboardingPanel
            icon={<img alt="" src={yomitomoLogo} />}
            eyebrow="Reading · Dialogue · Thinking"
            title="你有多久，认真读完一篇文章了？"
            description="Yomitomo 是一个 AI 伴读。你读文章的时候，它也在读；你画的高亮，它会回应；它画的高亮，你可以追问；你写下一句感受，它接一句看法。"
          >
            <div className="onboarding-value-card">
              <strong>这是 Yomitomo，伴读</strong>
              <p>
                你专注地读，它认真地陪。那些批注、来回的对话、灵光一闪的想法都会留在文章旁边，明天、下个月、几年后都能回到同一个阅读现场。
              </p>
            </div>
            <div className="onboarding-feature-strip">
              <span>个人批注</span>
              <span>AI 页边批注</span>
              <span>@ 助手评论</span>
            </div>
            <div className="onboarding-actions">
              <Button type="button" onClick={() => setStep('profile')}>
                开始体验
                <ArrowRight size={16} />
              </Button>
            </div>
          </OnboardingPanel>
        ) : null}

        {step === 'profile' ? (
          <OnboardingPanel
            icon={<User size={22} />}
            eyebrow="你的阅读身份"
            title="设置你的阅读身份"
            description="昵称和头像会出现在你的批注和评论里，帮助你把每一次阅读留下清晰的个人痕迹。"
          >
            <div className="onboarding-profile-grid">
              <div className="user-profile-avatar-row onboarding-avatar-row">
                <AvatarImage
                  value={profileDraft.avatar || ''}
                  className="user-profile-avatar-preview"
                  fallback={nickname.slice(0, 1) || '我'}
                />
                <div className="onboarding-avatar-copy">
                  <strong>{nickname || '我'}</strong>
                  <OnboardingAvatarUploadButton
                    onChange={(avatar) => setProfileDraft((draft) => ({ ...draft, avatar }))}
                  />
                </div>
              </div>
              <label>
                <span>昵称</span>
                <Input
                  autoFocus
                  value={profileDraft.nickname || ''}
                  placeholder="例如 Kevin"
                  onChange={(event) =>
                    setProfileDraft((draft) => ({ ...draft, nickname: event.target.value }))
                  }
                />
              </label>
              <label>
                <span>用户名</span>
                <Input
                  value={profileDraft.username || ''}
                  placeholder="留空则使用昵称"
                  spellCheck={false}
                  onChange={(event) =>
                    setProfileDraft((draft) => ({
                      ...draft,
                      username: sanitizeUsernameInput(event.target.value),
                    }))
                  }
                />
              </label>
            </div>
            <div className="onboarding-actions">
              <Button type="button" variant="secondary" onClick={() => setStep('welcome')}>
                返回
              </Button>
              <Button disabled={!canContinueProfile || busy} type="button" onClick={saveProfile}>
                {busy ? '保存中' : '继续'}
                <ArrowRight size={16} />
              </Button>
            </div>
          </OnboardingPanel>
        ) : null}

        {step === 'model' ? (
          <OnboardingPanel
            icon={<KeyRound size={22} />}
            eyebrow="启动 AI 阅读能力"
            title="选择模型服务商"
            description="选择一个预设服务商，填写 API Key，测试通过后会用于阅读批注、评论回复和读后整理。"
          >
            <div className="onboarding-provider-form">
              <ProviderForm
                draft={providerDraft}
                onChange={setProviderDraft}
                selectContentClassName="theme-select-content onboarding-select-content"
                showReasoning={false}
              />
            </div>
            {status ? <p className="onboarding-status">{status}</p> : null}
            <div className="onboarding-actions">
              <Button
                disabled={busy}
                type="button"
                variant="secondary"
                onClick={() => setStep('profile')}
              >
                返回
              </Button>
              <Button disabled={!canContinueModel || busy} type="button" onClick={saveModel}>
                {busy ? '测试中' : '保存并测试'}
                <ArrowRight size={16} />
              </Button>
            </div>
          </OnboardingPanel>
        ) : null}

        {step === 'article' ? (
          <OnboardingPanel
            icon={<Bot size={22} />}
            eyebrow="选择练习文章"
            title="进入一篇内置文章"
            description="进入后先选中一句话写批注，再让助手批注全文，最后在任意批注下 @ 助手继续问。"
          >
            <div className="onboarding-article-grid">
              {onboardingArticles.map((article) => (
                <button
                  className={article.id === selectedArticleId ? 'is-active' : undefined}
                  key={article.id}
                  type="button"
                  onClick={() => setSelectedArticleId(article.id)}
                >
                  <span>{article.label}</span>
                  <strong>{article.title}</strong>
                  <em>
                    {article.readingTime} · 推荐 {article.assistant}
                  </em>
                  <p>{article.excerpt}</p>
                </button>
              ))}
            </div>
            {status ? <p className="onboarding-status">{status}</p> : null}
            <div className="onboarding-actions">
              <Button
                disabled={busy}
                type="button"
                variant="secondary"
                onClick={() => setStep('model')}
              >
                返回
              </Button>
              <Button disabled={busy} type="button" onClick={completeWithArticle}>
                {busy ? '准备中' : '进入阅读器'}
                <ArrowRight size={16} />
              </Button>
            </div>
          </OnboardingPanel>
        ) : null}
      </div>
    </section>
  );
}

function OnboardingPanel({
  icon,
  eyebrow,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="onboarding-panel">
      <div className="onboarding-panel-icon">{icon}</div>
      <span className="onboarding-eyebrow">{eyebrow}</span>
      <h2>{title}</h2>
      <p>{description}</p>
      {children}
    </div>
  );
}

function OnboardingAvatarUploadButton({ onChange }: { onChange: (avatar: string) => void }) {
  async function loadFile(input: HTMLInputElement) {
    const file = input.files?.[0];
    if (!file) return;
    onChange(await readFileAsDataUrl(file));
    input.value = '';
  }

  return (
    <label className="onboarding-avatar-upload-control">
      <Upload size={16} />
      <span>上传头像</span>
      <input
        accept="image/*"
        type="file"
        onChange={(event) => void loadFile(event.currentTarget)}
      />
    </label>
  );
}

function OnboardingAssistantBackdrop() {
  return (
    <div className="onboarding-assistant-backdrop" aria-hidden="true">
      {onboardingAssistantVisuals.map((visual, index) => (
        <figure
          className={`onboarding-assistant-card is-${visual.variant} is-slot-${index}`}
          key={`${visual.variant}-${index}`}
        >
          <img alt="" src={visual.image} />
          <figcaption>{visual.name}</figcaption>
        </figure>
      ))}
    </div>
  );
}

function OnboardingVisualCollage({ step }: { step: OnboardingStep }) {
  return (
    <aside className={`onboarding-visual-collage is-${step}`} aria-hidden="true">
      <figure className="onboarding-visual-card is-main">
        <img alt="" src={readerWindowImage} />
      </figure>
      <figure className="onboarding-visual-card is-companion">
        <img alt="" src={readingCompanionImage} />
      </figure>
      <figure className="onboarding-visual-card is-page">
        <img alt="" src={annotatedPageImage} />
      </figure>
      <figure className="onboarding-visual-card is-desk">
        <img alt="" src={readerDeskImage} />
      </figure>
      <figure className="onboarding-visual-card is-notes">
        <img alt="" src={readingNotesImage} />
      </figure>
    </aside>
  );
}

function createOnboardingArticle(article: OnboardingArticle): ArticleRecord {
  const now = new Date().toISOString();
  const contentHtml = article.contentHtml.replace(/\n\s+/g, '\n').trim();
  return {
    id: article.id,
    url: `https://yomitomo.app/onboarding/${article.id}`,
    canonicalUrl: `https://yomitomo.app/onboarding/${article.id}`,
    title: article.title,
    byline: 'Yomitomo',
    excerpt: article.excerpt,
    siteName: 'Yomitomo 入门文章',
    themeColor: '#f4c95d',
    contentHtml,
    contentHash: hashText(contentHtml),
    annotations: [],
    createdAt: now,
    updatedAt: now,
  };
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}
