export const semanticRetrievalLanguages = ['zh', 'en', 'ja'] as const;

export const semanticRetrievalRelations = ['same', 'complements', 'contradicts'] as const;

export const semanticRetrievalEvidenceGrades = {
  necessary: 3,
  hardNegative: 0,
} as const;

export type SemanticRetrievalLanguage = (typeof semanticRetrievalLanguages)[number];

export type SemanticRetrievalRelation = (typeof semanticRetrievalRelations)[number];

export type SemanticRetrievalEvidencePair = {
  necessary: string;
  hardNegative: string;
};

export type SemanticRetrievalScenario = {
  id: string;
  queryLanguage: SemanticRetrievalLanguage;
  relation: SemanticRetrievalRelation;
  queries: {
    relate: string;
    ask: string;
  };
  evidence: Record<SemanticRetrievalLanguage, SemanticRetrievalEvidencePair>;
};

export const semanticRetrievalScenarios = [
  {
    id: 'spaced-practice-transfer',
    queryLanguage: 'zh',
    relation: 'same',
    queries: {
      relate: '我把复习从考前集中突击改成每隔几天回想一次，记住的内容反而更久。',
      ask: '为什么拉开练习时间通常比一次学完更有利于长期记忆？',
    },
    evidence: {
      zh: {
        necessary: '护士培训把同一套处置步骤分散到四周演练，三个月后的无提示操作明显更完整。',
        hardNegative: '两次培训之间至少间隔三天，主要是为了让夜班人员都能排进教室。',
      },
      en: {
        necessary:
          'Gardeners who identified the same plant families in several short sessions retained the distinctions into the next season.',
        hardNegative:
          'The garden center spaces its weekend workshops apart so the parking lot does not fill at noon.',
      },
      ja: {
        necessary: '楽器の運指を数日に分けて思い出す練習をした生徒は、翌月も正確に演奏できた。',
        hardNegative: '音楽教室は隣の部屋に音が漏れないよう、レッスンの間隔を十分に空けている。',
      },
    },
  },
  {
    id: 'urban-shade-heat',
    queryLanguage: 'zh',
    relation: 'same',
    queries: {
      relate: '同一条街上，有树荫的一侧即使车流相同，下午也比铺满石材的一侧凉得多。',
      ask: '连续的城市树荫为什么能缓解行人尺度的高温？',
    },
    evidence: {
      zh: {
        necessary: '社区测温发现，成排树冠既挡住短波辐射，也通过蒸腾降低了人行道附近的热负荷。',
        hardNegative: '园林部门修剪行道树，是为了避免树荫遮住夜间商铺的发光招牌。',
      },
      en: {
        necessary:
          'A shaded bus corridor stayed cooler because its mature canopy reduced radiant exposure and released moisture throughout the afternoon.',
        hardNegative:
          'The city replaced faded shade names on its paint chart after customers confused charcoal with slate.',
      },
      ja: {
        necessary:
          '連続した街路樹の下では、日射の遮断と葉からの蒸散が重なり、歩行者が受ける熱が小さくなった。',
        hardNegative: '商店街は日陰側の看板だけ文字が読みにくいとして、照明の向きを変更した。',
      },
    },
  },
  {
    id: 'cache-invalidation-ownership',
    queryLanguage: 'zh',
    relation: 'same',
    queries: {
      relate: '三个模块都能修改同一份缓存，却没有任何一个模块负责判断它何时失效。',
      ask: '缓存写入没有唯一责任方时，为什么陈旧数据会越来越难消除？',
    },
    evidence: {
      zh: {
        necessary:
          '订单状态被多个服务分别缓存后，每次修复都只清掉其中一份副本，旧状态因此反复出现。',
        hardNegative: '浏览器把图片缓存到磁盘后，第二次打开商品页可以少下载几个文件。',
      },
      en: {
        necessary:
          'When both billing and fulfillment could rewrite the customer snapshot, neither service knew which update made the shared copy obsolete.',
        hardNegative:
          'The build cache is stored on a larger drive because compiled assets no longer fit on developer laptops.',
      },
      ja: {
        necessary:
          '複数の画面が同じ在庫キャッシュを更新した結果、どの変更が無効化を担うのか分からなくなった。',
        hardNegative: '画像キャッシュの保存先を変更すると、端末の空き容量を確保しやすくなる。',
      },
    },
  },
  {
    id: 'preventive-maintenance-cost',
    queryLanguage: 'zh',
    relation: 'same',
    queries: {
      relate: '停机保养看起来损失了半天产量，但一次轴承突然损坏就让整条线停了三天。',
      ask: '为什么计划内维护可能降低设备的总停机成本？',
    },
    evidence: {
      zh: {
        necessary: '水厂按振动趋势提前更换泵体密封，避开了故障后排空管网和紧急采购的额外时间。',
        hardNegative: '物业把电梯保养安排在周二，是因为当天写字楼访客人数最少。',
      },
      en: {
        necessary:
          'A ferry operator traded brief scheduled inspections for fewer engine failures that would otherwise cancel several days of crossings.',
        hardNegative:
          'The maintenance department changed uniform suppliers after the old jackets became too warm for summer shifts.',
      },
      ja: {
        necessary: '印刷工場は摩耗部品を計画停止中に交換し、突発故障に伴う長い復旧作業を減らした。',
        hardNegative: '工場の点検日は社員食堂も休業するため、弁当の注文数を前日に集めている。',
      },
    },
  },
  {
    id: 'narrative-distance-empathy',
    queryLanguage: 'zh',
    relation: 'same',
    queries: {
      relate:
        '作者没有直接写母亲多么悲伤，只反复记录她每天把第二只杯子放回柜子。克制反而让失落更具体。',
      ask: '叙事上的克制为什么有时比直接说明情绪更能引发共情？',
    },
    evidence: {
      zh: {
        necessary: '小说只写老人每晚多摆一副碗筷，让读者从重复动作中自行意识到缺席者的分量。',
        hardNegative: '编辑删去三段情绪描写，是因为全书已经超过出版社约定的字数。',
      },
      en: {
        necessary:
          'By describing an untouched coat rather than naming grief, the memoir leaves readers to complete the emotional meaning themselves.',
        hardNegative:
          'The narrator keeps a measured distance from the microphone to prevent breath noise during the recording.',
      },
      ja: {
        necessary:
          '悲しみを説明せず、空いた座布団だけを描いた場面では、読者が喪失を自分で補う余地が生まれる。',
        hardNegative: '朗読者は感情を抑えた声を選び、隣室の収録に音が入らないようにした。',
      },
    },
  },
  {
    id: 'biodiversity-resilience',
    queryLanguage: 'zh',
    relation: 'same',
    queries: {
      relate: '虫害来临时，单一种植的地块几乎同时减产，混种地块却只损失了其中一部分。',
      ask: '物种或品种多样性为什么能降低生态系统同时失效的风险？',
    },
    evidence: {
      zh: {
        necessary: '沿海湿地保留多种耐盐植物后，极端潮位只淘汰了部分群落，整体固土功能仍然存在。',
        hardNegative: '农场把不同颜色的花种在入口附近，是为了让游客拍照时背景更丰富。',
      },
      en: {
        necessary:
          'A forest containing trees with different drought tolerances maintained canopy cover when one species failed during a dry year.',
        hardNegative:
          'The seed catalog uses a diverse set of cover photographs so each annual edition looks distinct.',
      },
      ja: {
        necessary:
          '耐寒性の異なる品種を組み合わせた果樹園では、遅霜が来ても収穫全体は失われなかった。',
        hardNegative: '植物園は多様な品種名を五十音順に並べ、来園者が札を探しやすくした。',
      },
    },
  },
  {
    id: 'transit-frequency-adoption',
    queryLanguage: 'zh',
    relation: 'complements',
    queries: {
      relate: '新公交线路经过更多社区，但二十分钟才来一班，许多人仍然选择开车。',
      ask: '除了线路覆盖，什么运营因素会直接影响公共交通的使用意愿？',
    },
    evidence: {
      zh: {
        necessary: '当班次缩短到无需查时刻表的间隔后，乘客不再把错过一班车视为一次重大延误。',
        hardNegative: '交通局把线路图上的覆盖颜色调深，以便打印后仍能看清社区边界。',
      },
      en: {
        necessary:
          'Riders valued predictable headways more than a longer route because uncertain waits made transfers too risky.',
        hardNegative:
          'The radio station changed its broadcast frequency after drivers reported static near the bus depot.',
      },
      ja: {
        necessary: '運行間隔が短く遅れの幅も小さい路線では、乗り継ぎの失敗を心配せずに利用できる。',
        hardNegative: '路線の停留所名を大きく表示すると、初めて乗る観光客にも地図が読みやすい。',
      },
    },
  },
  {
    id: 'sleep-memory-consolidation',
    queryLanguage: 'zh',
    relation: 'complements',
    queries: {
      relate: '晚上听课时每个概念都明白，熬夜整理完笔记后，第二天却很难把它们连起来。',
      ask: '学习结束后的什么过程会影响新记忆能否稳定保留下来？',
    },
    evidence: {
      zh: {
        necessary: '实验参与者学习路线后正常睡眠，比通宵清醒的人更能在第二天还原岔路顺序。',
        hardNegative: '学生换了较硬的床垫后更早起床，因此赶上了第一班校车。',
      },
      en: {
        necessary:
          'New vocabulary survived the following week more reliably when learners slept before receiving another large batch of input.',
        hardNegative:
          'The sleep tracker stores nightly charts for a year before deleting older records from the phone.',
      },
      ja: {
        necessary: '練習後に十分眠った参加者は、翌日に指の動きをより正確に再現できた。',
        hardNegative: '夜間講座の終了時刻を早めたところ、最終電車に間に合う受講者が増えた。',
      },
    },
  },
  {
    id: 'open-source-governance',
    queryLanguage: 'zh',
    relation: 'complements',
    queries: {
      relate: '项目代码任何人都能读，但路线图、合并权限和发布节奏仍由一家公司单方面决定。',
      ask: '判断一个开源项目是否真正开放，还需要观察代码许可之外的什么？',
    },
    evidence: {
      zh: {
        necessary:
          '社区能否参与提案、获得维护权限并公开解决争议，决定了外部贡献者有没有实际治理权。',
        hardNegative: '仓库把许可证文件放到根目录后，扫描工具终于不再报告缺失。',
      },
      en: {
        necessary:
          'A public repository remained company-controlled until independent maintainers gained votes on releases and membership.',
        hardNegative:
          'The open-source font includes additional weights so headings can appear lighter on high-resolution screens.',
      },
      ja: {
        necessary:
          '意思決定の議事録や権限移譲の手順が公開されて初めて、社外の参加者も方針に影響できる。',
        hardNegative:
          '公開されたソースコードには、日本語の設定例を追加した README が付属している。',
      },
    },
  },
  {
    id: 'inflation-expectations-loop',
    queryLanguage: 'zh',
    relation: 'complements',
    queries: {
      relate: '原材料只涨了一次，企业和员工却开始按明年还会继续涨价来重新谈合同。',
      ask: '一次价格冲击通过什么预期机制可能变得更持久？',
    },
    evidence: {
      zh: {
        necessary: '供应商把未来涨价写进长期报价，工人也提前要求补偿，预期由此进入新的成本和售价。',
        hardNegative: '超市在节日前更换价签，是为了把促销价格印得更醒目。',
      },
      en: {
        necessary:
          'Once firms budgeted for recurring increases, advance price changes and wage bargaining helped reproduce the inflation they anticipated.',
        hardNegative:
          'The balloon supplier measures inflation time so each display reaches the same size before an event.',
      },
      ja: {
        necessary:
          '値上がりが続くと見込んだ企業が先に価格を改定し、家計も賃上げを求めると、その予想が次の物価に入り込む。',
        hardNegative: '店舗は値札の交換作業を短縮するため、棚ごとに同じ用紙サイズを採用した。',
      },
    },
  },
  {
    id: 'museum-provenance-context',
    queryLanguage: 'zh',
    relation: 'complements',
    queries: {
      relate: '展柜只写器物的年代和材质，却没有说明它如何离开原来的社区。',
      ask: '要理解博物馆藏品的意义，物理描述之外还缺少哪类信息？',
    },
    evidence: {
      zh: {
        necessary: '收集时间、交易过程和原持有者的声音，会改变观众对一件物品为何出现在此处的理解。',
        hardNegative: '展柜玻璃换成低反射材质后，游客更容易看清器物表面的纹样。',
      },
      en: {
        necessary:
          'An acquisition history can reveal coercion, exchange, or community use that an object label about age and material leaves invisible.',
        hardNegative:
          'The museum records the material of each display mount so conservators can order matching replacements.',
      },
      ja: {
        necessary:
          '誰がどのような状況で持ち出したのかを示す来歴は、展示品と元の共同体との関係を見えるようにする。',
        hardNegative: '展示室の年代順の配置を変更すると、入口付近の混雑が少なくなった。',
      },
    },
  },
  {
    id: 'screening-base-rate',
    queryLanguage: 'zh',
    relation: 'complements',
    queries: {
      relate: '一种筛查说准确率很高，但检测对象中的真实患病比例非常低，阳性结果未必等于患病。',
      ask: '解释筛查阳性结果时，除了检测准确性还必须知道什么？',
    },
    evidence: {
      zh: {
        necessary: '同样的灵敏度和特异度用于低患病率人群时，少量假阳性也可能超过真正的阳性人数。',
        hardNegative: '学校筛查报名材料时发现，提交照片的准确尺寸比文件名称更容易出错。',
      },
      en: {
        necessary:
          'The probability after a positive result depends on how common the condition was in the tested population before screening began.',
        hardNegative:
          'The clinic replaced its reception screen because the old display rendered test results in the wrong colors.',
      },
      ja: {
        necessary:
          '対象集団で病気がまれなら、性能の高い検査でも陽性者の中に偽陽性が多く含まれ得る。',
        hardNegative: '健康診断の受付では、陽性と陰性の用紙を別の棚に置いて配布を速くした。',
      },
    },
  },
  {
    id: 'psychological-safety-response',
    queryLanguage: 'zh',
    relation: 'complements',
    queries: {
      relate: '团队成员很早就看见了风险，却因为上次提出坏消息的人被责备而保持沉默。',
      ask: '让团队及时暴露问题，除了成员能力还取决于什么管理条件？',
    },
    evidence: {
      zh: {
        necessary:
          '负责人对质疑表现出好奇而不是惩罚，并公开承认自己的错误后，成员更愿意报告尚未证实的隐患。',
        hardNegative: '办公室更新消防通道标识后，员工更容易找到最近的安全出口。',
      },
      en: {
        necessary:
          'Teams surfaced weak signals earlier when leaders treated dissent as useful information rather than disloyalty.',
        hardNegative:
          'The safety team replaced cracked helmets before allowing contractors onto the construction floor.',
      },
      ja: {
        necessary:
          '上司が失敗の報告を評価し、反対意見を人事評価から切り離すと、問題が小さいうちに共有されやすい。',
        hardNegative: '会議室の机を丸く配置すると、全員が非常口の表示を確認しやすくなった。',
      },
    },
  },
  {
    id: 'long-hours-output',
    queryLanguage: 'zh',
    relation: 'contradicts',
    queries: {
      relate: '经理认为每天多坐在工位两小时，产出就会稳定增加两小时。',
      ask: '延长工作时间是否会按相同比例持续提高有效产出？',
    },
    evidence: {
      zh: {
        necessary: '连续加班后的审校团队虽然在线更久，返工和漏检增加，最终完成的合格稿件反而减少。',
        hardNegative: '公司把工位增加两排后，可以让更多临时项目成员同时到办公室工作。',
      },
      en: {
        necessary:
          'Engineers logged more hours late in the release cycle, but fatigue-driven defects consumed the apparent gain during rework.',
        hardNegative:
          'The office extended its opening hours so employees could collect personal packages after dinner.',
      },
      ja: {
        necessary:
          '長時間勤務が続いた校正部門では、判断ミスと手戻りが増え、納品できる件数は伸びなかった。',
        hardNegative: '勤務時間の表示を一時間単位に統一し、給与明細を読みやすくした。',
      },
    },
  },
  {
    id: 'carbon-offset-permanence',
    queryLanguage: 'zh',
    relation: 'contradicts',
    queries: {
      relate: '购买一次植树抵消后，这趟飞行产生的碳似乎就被永久消除了。',
      ask: '一次造林承诺能否自动等同于对化石排放的永久抵消？',
    },
    evidence: {
      zh: {
        necessary:
          '新林储存的碳可能因火灾、砍伐或幼树死亡重新进入大气，而燃油排放已经即时增加了碳库。',
        hardNegative: '航空公司在购票页增加植树图标后，更多乘客看见了自愿抵消选项。',
      },
      en: {
        necessary:
          'A forestry credit did not guarantee lasting removal because drought later killed much of the planted area and released the stored carbon.',
        hardNegative:
          'The airline offset the weight of a new galley by removing two unused storage cabinets.',
      },
      ja: {
        necessary:
          '森林の炭素は火災や伐採で戻り得るため、植林した時点で化石燃料の排出が永続的に相殺されたとは言えない。',
        hardNegative:
          '植樹イベントの参加費は、会場までのバス料金と苗木代が相殺されるよう設定された。',
      },
    },
  },
  {
    id: 'algorithm-transparency-trust',
    queryLanguage: 'zh',
    relation: 'contradicts',
    queries: {
      relate: '只要把推荐算法的源代码公开，用户就一定会理解并信任它。',
      ask: '公开算法实现是否足以自动产生公众信任？',
    },
    evidence: {
      zh: {
        necessary:
          '平台公开了模型代码，却没有解释训练数据、申诉渠道和实际影响，受影响用户的疑虑并未减少。',
        hardNegative: '开发团队公开源码后，外部贡献者修复了一个导致页面闪烁的算法实现错误。',
      },
      en: {
        necessary:
          'Publishing technical details failed to build confidence when people still could not contest decisions or understand the data behind them.',
        hardNegative:
          'The transparent casing lets students watch the sorting algorithm move colored blocks between trays.',
      },
      ja: {
        necessary:
          'コードが読めても、判断理由や異議申立ての方法が示されなければ、利用者の信頼は回復しなかった。',
        hardNegative:
          '推薦アルゴリズムの説明会を公開配信したところ、開発者向け資料の閲覧数が増えた。',
      },
    },
  },
  {
    id: 'school-ranking-learning',
    queryLanguage: 'zh',
    relation: 'contradicts',
    queries: {
      relate: '学校排名上升被直接当成所有学生学得更好的证明。',
      ask: '排名或标准化成绩提高是否必然代表更广泛的学习改善？',
    },
    evidence: {
      zh: {
        necessary: '学校集中训练计分题型后名次上升，但开放写作和未训练学科的表现没有同步变化。',
        hardNegative: '教育网站更新排名页面后，可以按地区筛选学校并导出表格。',
      },
      en: {
        necessary:
          'Test scores rose after lessons narrowed to examined formats, while independent problem solving showed no comparable improvement.',
        hardNegative:
          'The school moved up the sports ranking after recruiting a faster relay team.',
      },
      ja: {
        necessary:
          '出題形式に合わせた反復練習で順位は上がったが、初見の課題を解く力には変化が見られなかった。',
        hardNegative: '学校案内では、進学実績の順位を前年と同じ大きさの文字で掲載した。',
      },
    },
  },
  {
    id: 'remote-work-innovation',
    queryLanguage: 'zh',
    relation: 'contradicts',
    queries: {
      relate: '没有办公室茶水间的偶遇，远程团队就不可能产生真正的新想法。',
      ask: '缺少线下偶遇是否必然使远程协作失去创新能力？',
    },
    evidence: {
      zh: {
        necessary:
          '分布式设计团队通过异步提案、随机配对和定期原型评审，产生并验证了比原先更多的方案。',
        hardNegative: '远程员工收到同款咖啡杯后，在视频会议背景里更容易认出同事。',
      },
      en: {
        necessary:
          'A remote research group replaced hallway encounters with rotating critique sessions and generated several cross-discipline projects.',
        hardNegative:
          'The innovation office chose a remote building because its rent was lower than downtown space.',
      },
      ja: {
        necessary:
          '在宅中心の開発組織でも、定期的な組み合わせ変更と公開メモから新しい共同企画が生まれた。',
        hardNegative: '遠隔会議の背景画像を新しくすると、社内イベントの統一感が高まった。',
      },
    },
  },
  {
    id: 'historical-inevitability',
    queryLanguage: 'zh',
    relation: 'contradicts',
    queries: {
      relate: '既然后来发生了制度转型，它从一开始就只能走向这个结果。',
      ask: '已经发生的历史结果是否证明当时不存在其他可行路径？',
    },
    evidence: {
      zh: {
        necessary: '同期文件显示，多套方案曾获得接近的支持，最终选择取决于一次联盟破裂和临时表决。',
        hardNegative: '历史年表把制度转型放在同一颜色的栏目中，方便读者追踪年代。',
      },
      en: {
        necessary:
          'Archived negotiations reveal that a narrow procedural vote, not a settled trajectory, closed off two plausible alternatives.',
        hardNegative:
          'The museum path leads inevitably from the entrance to the final gallery because the side doors remain locked.',
      },
      ja: {
        necessary:
          '当時の日記には複数の選択肢が現実的に検討され、偶発的な政権交代が結論を変えたと記されている。',
        hardNegative: '歴史資料館の順路は一方向なので、来館者は必ず制度史の展示を最後に見る。',
      },
    },
  },
  {
    id: 'multitasking-throughput',
    queryLanguage: 'zh',
    relation: 'contradicts',
    queries: {
      relate: '同时回复消息、写报告和参加会议，等于把三件事并行完成，效率一定更高。',
      ask: '频繁切换多个认知任务是否通常会提高有效吞吐量？',
    },
    evidence: {
      zh: {
        necessary: '分析人员每次从报告切到即时消息后都要重新建立上下文，完成时间和错误率同时上升。',
        hardNegative: '操作系统允许多个下载任务并行运行，充分利用了空闲网络带宽。',
      },
      en: {
        necessary:
          'Workers alternating between complex tickets paid a reconstruction cost on every switch and resolved fewer cases by day’s end.',
        hardNegative:
          'The kitchen saves time by baking three identical trays in parallel inside the same large oven.',
      },
      ja: {
        necessary:
          '複雑な作業の途中で通知に応じるたびに考え直す時間が生じ、最終的な処理件数は減った。',
        hardNegative: '複数の印刷ジョブを同時に登録すると、利用者は機械の前で待たずに済む。',
      },
    },
  },
  {
    id: 'library-third-place',
    queryLanguage: 'en',
    relation: 'same',
    queries: {
      relate:
        'The neighborhood library is busiest where it offers ordinary places to sit, meet, and ask for help without requiring anyone to buy something.',
      ask: 'Can a public library function as social infrastructure beyond lending books?',
    },
    evidence: {
      zh: {
        necessary:
          '社区图书馆延长公共空间开放时间后，求职者、照护者和独居老人都把这里当成低门槛的日常联结点。',
        hardNegative: '图书馆把第三层的书架重新编号后，工作人员找书所需的时间缩短了。',
      },
      en: {
        necessary:
          'Residents used the branch as a neutral indoor meeting place, a source of practical assistance, and a dependable refuge during extreme weather.',
        hardNegative:
          'The library purchased a third copy of the novel after the waiting list reached forty readers.',
      },
      ja: {
        necessary:
          '地域の図書館は、利用料なしで滞在できる場所と相談窓口を提供し、世代の異なる住民が緩やかにつながる拠点になった。',
        hardNegative: '図書館は貸出冊数を増やすため、人気作品を入口近くの棚に移した。',
      },
    },
  },
  {
    id: 'modular-change-cost',
    queryLanguage: 'en',
    relation: 'same',
    queries: {
      relate:
        'A small pricing change touched twelve services because each one knew the billing database layout. The code was split into packages, but the decision was not contained.',
      ask: 'Do well-defined module responsibilities reduce the cost of changing a system?',
    },
    evidence: {
      zh: {
        necessary:
          '支付规则被收进一个对外提供稳定操作的模块后，数据库字段变化不再要求所有调用方同步修改。',
        hardNegative: '团队把一个大仓库拆成十二个目录后，代码浏览器的文件树变得更短。',
      },
      en: {
        necessary:
          'Once tax calculation had one owner and a narrow contract, new regional rules changed that implementation without spreading conditionals through checkout.',
        hardNegative:
          'The modular desk can be rearranged into several shapes when the office hosts a larger workshop.',
      },
      ja: {
        necessary:
          '在庫判断を一つの境界内に集約すると、保存形式を変更しても利用側は同じ操作を呼び続けられた。',
        hardNegative: 'プロジェクトは機能ごとに色の違うフォルダを使い、資料の見た目を整理した。',
      },
    },
  },
  {
    id: 'prescribed-fire-mosaic',
    queryLanguage: 'en',
    relation: 'same',
    queries: {
      relate:
        'After decades without small fires, the forest held continuous dry fuel from the valley to the ridge. A carefully timed low-intensity burn could break that continuity.',
      ask: 'Can prescribed fire reduce the severity of some future wildfires?',
    },
    evidence: {
      zh: {
        necessary:
          '在湿度和风速适宜时清除林下细小燃料，能形成不连续的燃烧斑块，降低后来火势爬上树冠的机会。',
        hardNegative: '保护区在篝火季增加巡逻，是为了阻止游客离开指定营地生火。',
      },
      en: {
        necessary:
          'A sequence of cool burns reduced surface fuels and created a patchwork that slowed the next lightning-caused fire.',
        hardNegative:
          'The fire department prescribed a new color for evacuation maps so the boundary would remain visible in smoke.',
      },
      ja: {
        necessary:
          '条件を管理した火入れで低木や落枝を減らした区画では、翌年の山火事が高強度になりにくかった。',
        hardNegative: 'キャンプ場は火気使用の申請書をオンライン化し、受付時間を短縮した。',
      },
    },
  },
  {
    id: 'cash-transfer-agency',
    queryLanguage: 'en',
    relation: 'same',
    queries: {
      relate:
        'Families facing the same income shock did not share one urgent need: one repaired a roof, another paid transport to work, and another bought medicine.',
      ask: 'Can flexible cash assistance preserve more recipient choice than narrowly restricted aid?',
    },
    evidence: {
      zh: {
        necessary:
          '无条件补助让受助家庭按各自时点选择房租、学费或生产工具，而不是把所有人限制在同一种物资上。',
        hardNegative: '救助中心增加现金窗口后，领取纸质凭证的队伍被移到了另一层。',
      },
      en: {
        necessary:
          'Recipients used unrestricted grants for different bottlenecks, allowing local knowledge about household priorities to shape spending.',
        hardNegative:
          'The charity replaced its cash register because the old drawer jammed during weekend sales.',
      },
      ja: {
        necessary:
          '使途を限定しない給付では、各世帯が食費、移動費、修繕費のうち最も差し迫った不足に対応できた。',
        hardNegative: '支援団体は現金を数えやすくするため、紙幣を額面ごとの封筒に分けた。',
      },
    },
  },
  {
    id: 'bilingual-context-inference',
    queryLanguage: 'en',
    relation: 'same',
    queries: {
      relate:
        'I did not know one Japanese term in the essay, but the examples, contrast marker, and familiar characters let me infer enough to keep reading.',
      ask: 'Can contextual inference help bilingual readers learn unfamiliar vocabulary while reading?',
    },
    evidence: {
      zh: {
        necessary:
          '双语读者先从段落中的因果关系猜测生词，再查词确认，比脱离语境记住了更多用法限制。',
        hardNegative: '电子书把双语词典按钮移到工具栏右侧后，页面留出了更多阅读空间。',
      },
      en: {
        necessary:
          'Learners who predicted a word from the surrounding argument before checking it retained both its meaning and where it could be used.',
        hardNegative:
          'The bilingual edition prints the two languages in different typefaces so readers can tell the columns apart.',
      },
      ja: {
        necessary:
          '未知語を前後の対比や具体例から推測した後に辞書で確かめると、文脈と結び付いた語彙知識が残りやすい。',
        hardNegative: '語学アプリは辞書画面の背景色を変更し、長時間見てもまぶしくないようにした。',
      },
    },
  },
  {
    id: 'repairability-longevity',
    queryLanguage: 'en',
    relation: 'same',
    queries: {
      relate:
        'The headphones still sounded fine, but a glued-in battery turned one worn component into the end of the whole product.',
      ask: 'Does designing products for repair tend to extend their useful life?',
    },
    evidence: {
      zh: {
        necessary:
          '厂商提供可更换电池、标准螺丝和多年备件后，许多设备在单个部件损坏时不必整机报废。',
        hardNegative: '维修店延长营业时间后，顾客可以在下班途中领取已经修好的耳机。',
      },
      en: {
        necessary:
          'A laptop line with replaceable ports and published service guides remained in use through failures that retired sealed models.',
        hardNegative:
          'The product page uses a repair workshop as the background for its new advertising photographs.',
      },
      ja: {
        necessary:
          '交換可能な部品と修理手順が用意された家電は、小さな故障を直しながら使用期間を延ばせた。',
        hardNegative: '修理受付の番号札を大きくしたところ、待合室から順番を確認しやすくなった。',
      },
    },
  },
  {
    id: 'default-option-enrollment',
    queryLanguage: 'en',
    relation: 'same',
    queries: {
      relate:
        'Two benefit forms offered the same plans, yet enrollment changed sharply when one form made participation the preselected option.',
      ask: 'Can a default choice influence decisions even when every alternative remains available?',
    },
    evidence: {
      zh: {
        necessary:
          '退休储蓄从主动加入改为默认加入后，更多员工保留了预设比例，尽管他们随时可以退出。',
        hardNegative: '人事系统恢复默认字体后，福利表格在旧电脑上不再错位。',
      },
      en: {
        necessary:
          'Organ donation participation differed between otherwise similar forms because accepting the default required less immediate action.',
        hardNegative:
          'The settings screen adds a button that restores every color and sound preference to its factory default.',
      },
      ja: {
        necessary:
          '初期設定で参加が選ばれている制度では、選択肢が同じでも、そのまま受け入れる人が多くなった。',
        hardNegative: '申込画面の初期表示を午前九時に変更し、窓口の営業時間と合わせた。',
      },
    },
  },
  {
    id: 'replication-incentives',
    queryLanguage: 'en',
    relation: 'complements',
    queries: {
      relate:
        'Researchers say replication matters, but careers still reward surprising new findings far more than careful attempts to verify old ones.',
      ask: 'What must change besides research methods to make replication a routine part of science?',
    },
    evidence: {
      zh: {
        necessary:
          '期刊、资助和晋升若不认可重复研究，研究者即使掌握方法也很难把有限时间投入验证工作。',
        hardNegative: '实验室购买同型号移液器，是为了让不同房间的操作手感保持一致。',
      },
      en: {
        necessary:
          'Dedicated funding and publication formats made confirmatory studies viable by giving them credit before their results were known.',
        hardNegative:
          'The journal duplicated its archive server so readers could still download papers during maintenance.',
      },
      ja: {
        necessary:
          '追試を業績として評価し、結果にかかわらず登録済み報告を掲載する仕組みがなければ、実施する動機は弱いままである。',
        hardNegative: '研究室は実験ノートを二部印刷し、一冊を別の棚に保管した。',
      },
    },
  },
  {
    id: 'rural-broadband-adoption',
    queryLanguage: 'en',
    relation: 'complements',
    queries: {
      relate:
        'Fiber reached the village, but many households still used mobile data because subscriptions, devices, and setup remained out of reach.',
      ask: 'What determines whether new broadband infrastructure produces meaningful digital access?',
    },
    evidence: {
      zh: {
        necessary: '网络覆盖只有与可负担资费、合适终端和基础数字技能结合，才会转化为家庭实际使用。',
        hardNegative: '施工队把光纤卷盘放在村口空地，以免大型车辆堵住狭窄道路。',
      },
      en: {
        necessary:
          'Take-up remained low until a community program paired lower monthly prices with devices and help installing home connections.',
        hardNegative:
          'The broadband company changed its logo after merging the rural and urban marketing teams.',
      },
      ja: {
        necessary:
          '回線が敷設されても、料金負担や端末不足、利用支援の欠如が残れば、教育や行政サービスへの接続は進まない。',
        hardNegative: '通信会社は農村部の工事車両に新しい識別番号を貼り付けた。',
      },
    },
  },
  {
    id: 'passwordless-recovery',
    queryLanguage: 'en',
    relation: 'complements',
    queries: {
      relate:
        'Passkeys removed reused passwords from normal sign-in, but losing the only registered phone could still lock a person out.',
      ask: 'What must a passwordless login design provide in addition to a secure daily sign-in?',
    },
    evidence: {
      zh: {
        necessary:
          '恢复流程需要允许可信设备迁移或经过严格验证重新绑定，同时避免把客服重置变成更弱的攻击入口。',
        hardNegative: '登录页移除密码输入框后，设计师把按钮向上移动以填补空白。',
      },
      en: {
        necessary:
          'A resilient passkey system needs a tested recovery path that survives device loss without falling back to easily impersonated identity checks.',
        hardNegative:
          'The passwordless conference badge uses a magnetic clasp so attendees can remove it quickly.',
      },
      ja: {
        necessary:
          '端末の故障時にも安全に資格情報を復元でき、攻撃者には同じ手順を悪用させない本人確認設計が必要になる。',
        hardNegative: '認証アプリのアイコンから鍵の絵を外し、他の業務アプリと色をそろえた。',
      },
    },
  },
  {
    id: 'oral-history-archive',
    queryLanguage: 'en',
    relation: 'complements',
    queries: {
      relate:
        'The factory archive records wages and output, but not how night workers navigated childcare, danger, or informal mutual aid.',
      ask: 'What can oral histories add to an institution’s official written record?',
    },
    evidence: {
      zh: {
        necessary:
          '工人口述补出了档案表格没有记录的日常经验、内部语言和非正式协作，也让研究者看见制度如何被实际感受。',
        hardNegative: '档案馆为口述录音购买了新耳机，访客不必把音量调得很高。',
      },
      en: {
        necessary:
          'Recorded testimony revealed routines and conflicts omitted from management files, while also requiring attention to memory and later interpretation.',
        hardNegative:
          'The official record player was moved away from a window to keep sunlight off its wooden case.',
      },
      ja: {
        necessary:
          '当事者の語りは、公文書に残りにくい感情や非公式な慣行を示し、制度の内側で暮らした経験を補う。',
        hardNegative: '聞き取り会場の机を小さくし、録音機を話者の近くに置けるようにした。',
      },
    },
  },
  {
    id: 'mentoring-and-sponsorship',
    queryLanguage: 'en',
    relation: 'complements',
    queries: {
      relate:
        'Junior staff received plenty of private advice, yet the same people were repeatedly chosen for visible assignments and promotion discussions.',
      ask: 'What may career mentoring need in order to change access to advancement opportunities?',
    },
    evidence: {
      zh: {
        necessary:
          '除了提供建议，资深成员还需在任务分配和评审场合公开推荐新人，让其能力进入决策者视野。',
        hardNegative: '导师把每月谈话从周一改到周五，以免和部门例会冲突。',
      },
      en: {
        necessary:
          'Sponsorship differs from advice because a senior colleague spends influence to nominate someone for consequential work and defend that choice.',
        hardNegative:
          'The mentoring portal added calendar reminders after participants forgot several scheduled calls.',
      },
      ja: {
        necessary:
          '相談に乗るだけでなく、重要案件の候補として名前を挙げ、評価の場で実績を伝える働きかけが昇進機会を広げる。',
        hardNegative: '社内メンターの名札を新しくし、研修会場で見つけやすくした。',
      },
    },
  },
  {
    id: 'battery-grid-integration',
    queryLanguage: 'en',
    relation: 'complements',
    queries: {
      relate:
        'The battery can shift midday solar power into the evening, but a crowded transmission line still prevents energy from reaching the city.',
      ask: 'What does grid storage need besides battery capacity to make variable renewable power usable?',
    },
    evidence: {
      zh: {
        necessary:
          '储能还要与输电容量、预测和调度规则配合，否则电池有电也可能无法在需要的地点和时段释放。',
        hardNegative: '电池仓库按容量大小排列货架，使叉车更容易找到对应包装。',
      },
      en: {
        necessary:
          'Market rules and interconnection capacity determine whether stored electricity can respond at the location and moment the system needs it.',
        hardNegative:
          'The grid printed on the battery label helps technicians align it correctly inside the cabinet.',
      },
      ja: {
        necessary:
          '蓄電設備の接続系統、送電制約、需給予測を含む運用が整わなければ、再エネの余剰を有効に移せない。',
        hardNegative: '電池ケースの格子模様を細かくすると、表面の傷が目立ちにくくなった。',
      },
    },
  },
  {
    id: 'open-data-privacy',
    queryLanguage: 'en',
    relation: 'complements',
    queries: {
      relate:
        'The city removed names before publishing trip records, yet rare routes and timestamps could still point to particular residents.',
      ask: 'What must an open-data program consider beyond deleting direct identifiers?',
    },
    evidence: {
      zh: {
        necessary:
          '数据发布前还需评估多字段组合和外部资料能否重新识别个人，并限制过细的时间与位置粒度。',
        hardNegative: '开放数据网站删除用户名输入框后，访客无需注册即可下载文件。',
      },
      en: {
        necessary:
          'A privacy review must test linkage attacks, access controls, and aggregation choices rather than assuming that removing names makes records anonymous.',
        hardNegative:
          'The data team opened a second download server so large public files would arrive faster.',
      },
      ja: {
        necessary:
          '氏名がなくても行動履歴の組み合わせから個人が分かる場合があり、粒度調整や利用条件まで含めた管理が要る。',
        hardNegative: '公開データ一覧を五十音順に並べ替え、利用者が表を探しやすくした。',
      },
    },
  },
  {
    id: 'open-office-collaboration',
    queryLanguage: 'en',
    relation: 'contradicts',
    queries: {
      relate:
        'Removing every wall should make colleagues talk more, so an open office will automatically increase meaningful collaboration.',
      ask: 'Do open-plan offices reliably create more productive face-to-face collaboration?',
    },
    evidence: {
      zh: {
        necessary: '改成开放工位后，员工为避免打扰而更多使用即时消息，面对面交流反而下降。',
        hardNegative: '办公室拆墙后，采光能够到达原先没有窗户的走廊。',
      },
      en: {
        necessary:
          'Workers in the open layout wore headphones and withdrew from spontaneous conversation because noise and visibility made interruption costly.',
        hardNegative:
          'The open house allowed employees’ families to tour the office on Saturday afternoon.',
      },
      ja: {
        necessary:
          '全面的なオープン化で集中が難しくなり、職員は会話を避けて個室やオンライン連絡を使うようになった。',
        hardNegative: '執務室の壁をなくすと、大型家具を入口から運び込みやすくなった。',
      },
    },
  },
  {
    id: 'growth-mindset-slogans',
    queryLanguage: 'en',
    relation: 'contradicts',
    queries: {
      relate:
        'If teachers tell struggling students to adopt a growth mindset, achievement gaps should close even when instruction and resources remain unchanged.',
      ask: 'Are motivational messages alone enough to produce durable academic improvement?',
    },
    evidence: {
      zh: {
        necessary:
          '学校张贴努力标语后成绩没有持续变化；只有同时提供具体反馈、练习机会和补充教学的班级出现改善。',
        hardNegative: '教室把成长主题海报换成防水材质后，可以继续张贴到下个学期。',
      },
      en: {
        necessary:
          'Students had little reason to persist when the curriculum offered no workable strategy, timely feedback, or opportunity to revise failed work.',
        hardNegative:
          'The school garden measured faster plant growth after moving seedlings into a sunnier greenhouse.',
      },
      ja: {
        necessary:
          '考え方を変えるよう促すだけでは、教材へのアクセスや指導方法の差が残り、学習成果は安定して向上しなかった。',
        hardNegative: '成長という言葉を校訓に加えたところ、学校案内の表紙デザインが変更された。',
      },
    },
  },
  {
    id: 'automation-error-shift',
    queryLanguage: 'en',
    relation: 'contradicts',
    queries: {
      relate:
        'Once the approval process is automated, human mistakes disappear and the output no longer needs review.',
      ask: 'Does automation eliminate error rather than changing where error can occur?',
    },
    evidence: {
      zh: {
        necessary:
          '自动化减少了手工录入错误，却把一条错误规则同时应用到数千笔记录，使单次缺陷的影响范围扩大。',
        hardNegative: '审批系统自动发送提醒后，员工不必手工复制会议日期。',
      },
      en: {
        necessary:
          'The workflow removed repetitive slips but introduced configuration, input-quality, and silent scaling failures that required different controls.',
        hardNegative:
          'The automation team replaced a manual door with a motion sensor at the office entrance.',
      },
      ja: {
        necessary:
          '自動化後も入力データや設定の誤りは残り、誤った判断が高速に繰り返される新しい危険が生じた。',
        hardNegative: '自動通知の件名を短くすると、携帯電話でも最後まで表示されるようになった。',
      },
    },
  },
  {
    id: 'tourism-heritage-pressure',
    queryLanguage: 'en',
    relation: 'contradicts',
    queries: {
      relate:
        'More visitors bring more money, so tourism will always protect historic neighborhoods and living traditions.',
      ask: 'Does tourism growth automatically preserve the heritage that attracts visitors?',
    },
    evidence: {
      zh: {
        necessary:
          '游客增加推高租金并挤走传统店铺，街区外观被保留时，原有居民和日常技艺却逐渐消失。',
        hardNegative: '旅游局把历史街区的导览图印成折页，放进更小的纪念品袋。',
      },
      en: {
        necessary:
          'Revenue funded façade restoration, but crowding and short-term rentals displaced the community that had maintained the local practices.',
        hardNegative:
          'The heritage hotel added a second tour desk so guests could reserve museum tickets before breakfast.',
      },
      ja: {
        necessary:
          '観光向けの店舗ばかりが増えると、建物は残っても住民の行事や生業が続けられず、文化の担い手が失われる。',
        hardNegative: '歴史地区の案内板を多言語化し、外国人旅行者が道を尋ねる回数を減らした。',
      },
    },
  },
  {
    id: 'predictive-policing-data-bias',
    queryLanguage: 'en',
    relation: 'contradicts',
    queries: {
      relate:
        'A policing forecast is neutral because it uses historical crime data instead of an officer’s personal judgment.',
      ask: 'Does training a policing model on recorded incidents make its predictions socially neutral?',
    },
    evidence: {
      zh: {
        necessary:
          '历史记录同时反映了犯罪和过去巡逻集中地点，模型把更多警力再次派往这些区域后又产生更多记录。',
        hardNegative: '警务数据中心把旧档案转成统一日期格式，方便按年份排序。',
      },
      en: {
        necessary:
          'Arrest data encoded where enforcement had been concentrated, allowing the forecast to reproduce prior surveillance patterns as if they were risk alone.',
        hardNegative:
          'The prediction dashboard uses a neutral gray background so colored map markers remain legible.',
      },
      ja: {
        necessary:
          '検挙記録には過去の取締り配分が含まれるため、それを学習した予測は同じ地域への監視を強める循環を作り得る。',
        hardNegative: '警察署は事件記録の用紙を白黒印刷に変え、インク代を削減した。',
      },
    },
  },
  {
    id: 'speed-reading-comprehension',
    queryLanguage: 'en',
    relation: 'contradicts',
    queries: {
      relate:
        'By suppressing every pause and moving my eyes faster, I should be able to read three times as quickly without losing any understanding.',
      ask: 'Can reading speed increase without limit while comprehension stays unchanged?',
    },
    evidence: {
      zh: {
        necessary:
          '读者快速扫过熟悉材料时速度会上升，但面对需要推理的文本，减少回看和停顿会降低细节与关系理解。',
        hardNegative: '阅读软件把翻页动画调快后，用户觉得电子书界面响应更灵敏。',
      },
      en: {
        necessary:
          'Very high rates were achieved mainly by skimming; when tests required inference and detail, comprehension fell as processing time disappeared.',
        hardNegative:
          'The bookstore installed a faster barcode reader to shorten the checkout line.',
      },
      ja: {
        necessary:
          '視線移動を速めても、複雑な論証を統合する時間は省けず、一定点を超えると理解度が下がった。',
        hardNegative: '読書端末の画面更新速度が上がり、ページをめくる際の残像が少なくなった。',
      },
    },
  },
  {
    id: 'street-tree-water-tradeoff',
    queryLanguage: 'ja',
    relation: 'complements',
    queries: {
      relate:
        '街路樹は日陰をつくり、夏の歩道を涼しくする。暑さ対策として植樹をもっと増やすべきだと思う。',
      ask: '都市の植樹を暑さ対策として進める際、効果を左右する条件は何か。',
    },
    evidence: {
      zh: {
        necessary:
          '干旱城市的树冠扩张若没有再生水和耐旱树种配套，灌溉需求会在热浪期间与居民用水竞争。',
        hardNegative: '某城市把公园长椅统一刷成绿色，以便与新栽的树木协调。',
      },
      en: {
        necessary:
          'Cooling gains vary by placement: trees help most on exposed walking routes, while dense planting in narrow streets can restrict nighttime heat release.',
        hardNegative:
          'A botanical garden catalogued the autumn colors of fifty ornamental tree varieties.',
      },
      ja: {
        necessary:
          '植栽後の生存率は土壌容量と維持管理に左右され、苗木を増やすだけでは十年後の樹冠率は上がらない。',
        hardNegative: '街路樹の落ち葉を使った工作教室に、地域の小学生が参加した。',
      },
    },
  },
  {
    id: 'remote-work-output-variation',
    queryLanguage: 'ja',
    relation: 'contradicts',
    queries: {
      relate:
        '在宅勤務なら通勤がなく、誰でも集中できる時間が増える。だから職種に関係なく生産性は必ず上がるはずだ。',
      ask: '在宅勤務は、あらゆる職種で一律に生産性を高めるのか。',
    },
    evidence: {
      zh: {
        necessary:
          '远程办公提高了独立编码任务的完成量，却让需要频繁协调的新产品团队延长了决策时间，效果随任务依赖程度而变化。',
        hardNegative: '公司取消固定工位后，为远程员工设计了新的笔记本电脑贴纸。',
      },
      en: {
        necessary:
          'Call-center staff with quiet home offices improved output, but employees sharing rooms reported more interruptions and no measurable gain.',
        hardNegative:
          'A commuter survey found that employees preferred trains with reliable Wi-Fi.',
      },
      ja: {
        necessary:
          '新人研修を遠隔化した部署では個人作業時間は増えた一方、質問の遅れによって習熟までの期間が長くなった。',
        hardNegative: '在宅勤務者の多くが、オンライン会議では無地の背景を選んでいる。',
      },
    },
  },
  {
    id: 'lockfile-build-reproducibility',
    queryLanguage: 'ja',
    relation: 'same',
    queries: {
      relate:
        '依存関係の範囲だけを残すと、同じコミットでもインストール時期によって別の成果物になり得る。ロック情報も共有した方がよい。',
      ask: 'ロックファイルの共有は、ビルドの再現性を高めるのか。',
    },
    evidence: {
      zh: {
        necessary:
          '构建服务器依据已提交的锁定清单安装精确版本后，开发机与发布环境不再解析到不同的传递依赖。',
        hardNegative: '开发团队把依赖包按下载量排序，以决定下次技术分享的主题。',
      },
      en: {
        necessary:
          'An incident review traced a nondeterministic release to a new transitive package; pinning the resolved graph made clean installs repeatable.',
        hardNegative:
          'The package manager changed the color of its progress bar in the latest release.',
      },
      ja: {
        necessary:
          'ロック情報をCIの入力として固定すると、同一リビジョンから取得されるパッケージの組み合わせを後日でも再現できる。',
        hardNegative: 'リポジトリのREADMEには、開発環境を起動するコマンドが追記された。',
      },
    },
  },
  {
    id: 'wages-inflation-purchasing-power',
    queryLanguage: 'ja',
    relation: 'complements',
    queries: {
      relate:
        '今年は賃金が上がったので、家計にも余裕が出たように見える。給与の伸びを生活改善の指標にできそうだ。',
      ask: '賃金上昇から生活水準の改善を判断するには、何を併せて見る必要があるか。',
    },
    evidence: {
      zh: {
        necessary:
          '工资上涨百分之五并不等于购买力提高；若同期家庭常购商品价格上涨百分之七，实际可支配能力反而下降。',
        hardNegative: '企业把加薪通知改为电子文件，减少了纸张使用。',
      },
      en: {
        necessary:
          'Median pay can rise while lower-income households fall behind when rent and food outpace the headline inflation basket.',
        hardNegative:
          'A payroll vendor introduced a dashboard that displays salaries in multiple currencies.',
      },
      ja: {
        necessary:
          '名目賃金だけでなく、物価を差し引いた実質賃金と税・社会保険料控除後の所得を確認する必要がある。',
        hardNegative: '給与明細の文字が小さいという要望を受け、会社は印刷様式を変更した。',
      },
    },
  },
  {
    id: 'sleep-tracker-score-certainty',
    queryLanguage: 'ja',
    relation: 'contradicts',
    queries: {
      relate:
        '睡眠アプリの点数が高ければ、十分に深く眠れたと考えてよい。毎朝のスコアだけで睡眠状態を正確に判断できるはずだ。',
      ask: '消費者向け睡眠アプリのスコアだけで、睡眠の質を正確に評価できるのか。',
    },
    evidence: {
      zh: {
        necessary:
          '腕部动作设备常把安静躺卧误判为睡眠，对睡眠阶段的区分也不能替代脑电、眼动和肌电测量。',
        hardNegative: '某款睡眠应用新增了月亮图标，用户认为夜间界面更柔和。',
      },
      en: {
        necessary:
          'Two popular trackers assigned different deep-sleep durations to the same nights despite producing similarly reassuring summary scores.',
        hardNegative:
          'The smartwatch battery lasted three nights when its screen brightness was reduced.',
      },
      ja: {
        necessary:
          '睡眠指標は機種固有の推定に依存し、飲酒や体調による覚醒を本人の感覚ほど捉えられない場合がある。',
        hardNegative: '目覚まし音を鳥の声に変えた利用者は、以前の音より好みだと回答した。',
      },
    },
  },
  {
    id: 'unreliable-narrator-interpretation',
    queryLanguage: 'ja',
    relation: 'same',
    queries: {
      relate:
        'この小説では語り手の説明と周囲の人物の行動が何度も食い違う。言葉を事実ではなく自己正当化として読むべきだろう。',
      ask: '作中の矛盾は、語り手の信頼性を疑う根拠になるか。',
    },
    evidence: {
      zh: {
        necessary:
          '叙述者声称自己从未嫉妒弟弟，下一章却隐瞒了弟弟的来信；这种选择性省略暴露了他的自我辩护。',
        hardNegative: '小说的封面采用第一人称视角绘制了一条空旷街道。',
      },
      en: {
        necessary:
          'The diary dates cannot match the public events described, suggesting that the narrator edits memory to preserve a preferred version of herself.',
        hardNegative: 'The audiobook narrator changes her speaking pace during the final chapter.',
      },
      ja: {
        necessary:
          '終盤で別人物の証言が冒頭の回想を覆すため、読者は内容よりも、語り手がそう語る動機を検討することになる。',
        hardNegative: '作者は刊行記念イベントで、執筆に使った万年筆を紹介した。',
      },
    },
  },
  {
    id: 'antibiotics-diagnosis-adherence',
    queryLanguage: 'ja',
    relation: 'complements',
    queries: {
      relate: '抗菌薬は細菌感染に効くが、不要な使用は耐性菌を増やす。処方量を減らすことが重要だ。',
      ask: '耐性を抑えつつ必要な患者を治療するには、処方削減以外に何が必要か。',
    },
    evidence: {
      zh: {
        necessary:
          '快速诊断能区分细菌与病毒感染，使医生既避免无效用药，也不延误真正需要抗菌治疗的患者。',
        hardNegative: '医院把药房取药窗口从一楼移到了门诊大厅旁边。',
      },
      en: {
        necessary:
          'Stewardship works best when prescribing review is paired with correct dose, treatment duration, and follow-up rather than a simple reduction target.',
        hardNegative:
          'A tablet manufacturer redesigned its packaging to make the dosage text easier to read.',
      },
      ja: {
        necessary:
          '畜産・医療・環境をまたぐ耐性菌監視と感染予防がなければ、病院の処方だけを減らしても流入経路は残る。',
        hardNegative: '薬局では、抗菌薬の名前を覚えるための職員向けクイズが実施された。',
      },
    },
  },
  {
    id: 'ev-lifecycle-emissions',
    queryLanguage: 'ja',
    relation: 'contradicts',
    queries: {
      relate:
        '電気自動車は走行中に排気ガスを出さない。したがって製造や電源構成に関係なく、どの地域でも最初から排出はゼロだ。',
      ask: '電気自動車は、製造から走行まで常に排出ゼロと言えるのか。',
    },
    evidence: {
      zh: {
        necessary:
          '电池制造会产生前期排放，电动车通常要行驶一段里程后，才用较低的运行排放抵消相对燃油车的制造差额。',
        hardNegative: '某电动车把充电口设置在车尾，车主需要倒车进入部分停车位。',
      },
      en: {
        necessary:
          'Charging on a coal-heavy grid can produce substantial indirect emissions even though the vehicle itself has no tailpipe exhaust.',
        hardNegative:
          'Drivers rated an electric sedan’s acceleration more highly than its cup holders.',
      },
      ja: {
        necessary:
          '車両の生涯排出量は電池容量、製造時の電力、使用地域の発電構成、走行距離によって変わる。',
        hardNegative: '自治体は電気自動車の試乗会で、静かな走行音を来場者に体験してもらった。',
      },
    },
  },
  {
    id: 'type-system-feedback',
    queryLanguage: 'ja',
    relation: 'same',
    queries: {
      relate:
        '型検査が早い段階で不整合を示せば、実行して初めて分かる単純な誤りを減らせる。型は設計中のフィードバックになる。',
      ask: '静的型検査は、実行前にインターフェースの不整合を見つける助けになるか。',
    },
    evidence: {
      zh: {
        necessary:
          '接口把日期从字符串改为结构体后，类型检查在所有未更新的调用点报错，使遗漏在部署前暴露。',
        hardNegative: '编辑器把不同类型名称显示成不同颜色，开发者觉得界面更清晰。',
      },
      en: {
        necessary:
          'A discriminated union forced the handler to account for a new state at compile time instead of silently falling through at runtime.',
        hardNegative: 'The compiler logo was redesigned for the project’s tenth anniversary.',
      },
      ja: {
        necessary:
          '戻り値のnull可能性を型に表したところ、未確認のままプロパティを読む箇所がテスト実行前に検出された。',
        hardNegative: 'チームは型名をアルファベット順に並べたAPI一覧を作成した。',
      },
    },
  },
  {
    id: 'eyewitness-memory-reconstruction',
    queryLanguage: 'ja',
    relation: 'contradicts',
    queries: {
      relate:
        '事件を間近で見た人の記憶は録画のように保存される。本人が強い確信を持っていれば、その証言は正確だと判断できる。',
      ask: '目撃者の確信の強さは、記憶の正確さを保証するのか。',
    },
    evidence: {
      zh: {
        necessary:
          '暗示性提问改变了参与者对车速和破碎玻璃的回忆，但他们仍对后来形成的错误记忆表现出高度确信。',
        hardNegative: '法庭录制证人陈述时，更换了收音效果较好的麦克风。',
      },
      en: {
        necessary:
          'Later confidence can be inflated by repeated questioning and confirming feedback even when the original identification was uncertain.',
        hardNegative: 'A witness arrived early because the courthouse parking lot was nearly full.',
      },
      ja: {
        necessary:
          '目撃後に他人の説明を聞くと、実際には見ていない特徴が自分の記憶として取り込まれることがある。',
        hardNegative: '証言台の位置が変わり、傍聴席から証人の顔が見やすくなった。',
      },
    },
  },
  {
    id: 'congestion-charge-demand',
    queryLanguage: 'ja',
    relation: 'same',
    queries: {
      relate:
        '混雑する時間帯の道路利用に料金を課すと、移動時間をずらしたり公共交通へ移ったりする人が出る。渋滞を減らせる可能性がある。',
      ask: '時間帯別の混雑料金は、交通需要を分散して渋滞を減らせるか。',
    },
    evidence: {
      zh: {
        necessary:
          '高峰收费实施后，部分通勤者改乘地铁或提前出发，收费区域在最拥堵时段的车流量持续下降。',
        hardNegative: '收费站采用新的字体后，驾驶员更容易看清车道编号。',
      },
      en: {
        necessary:
          'Dynamic tolls kept a managed lane moving by discouraging some optional trips as demand approached capacity.',
        hardNegative: 'A navigation app added a setting to display toll roads in orange.',
      },
      ja: {
        necessary:
          '都心流入への課金後、平日朝の自動車移動が減り、バスの所要時間のばらつきも小さくなった。',
        hardNegative: '高速道路会社は料金所職員の制服を新しいデザインに変更した。',
      },
    },
  },
  {
    id: 'archival-provenance-trust',
    queryLanguage: 'ja',
    relation: 'complements',
    queries: {
      relate:
        '古い手紙の画像が公開されていて、内容も当時の出来事と合っている。史料として引用できそうだ。',
      ask: 'デジタル化された史料を信頼して引用する前に、画像の内容以外で何を確認すべきか。',
    },
    evidence: {
      zh: {
        necessary:
          '研究者还需确认原件收藏机构、档案编号、扫描过程和文件是否经过裁切，否则无法追踪来源及缺失页面。',
        hardNegative: '扫描仪厂商推出了更轻的便携型号，适合放在普通书包中。',
      },
      en: {
        necessary:
          'A documented chain of custody distinguishes a repository scan from an image that may have been rearranged, retouched, or detached from its folder context.',
        hardNegative:
          'The archive website lets visitors choose between a dark and light image viewer.',
      },
      ja: {
        necessary:
          '作成者、受取人、日付の同定根拠と目録改訂履歴を残すことで、後の研究者が出典判断を再検証できる。',
        hardNegative: '古い手紙を題材にした展示会では、羽根ペンの体験コーナーが設けられた。',
      },
    },
  },
  {
    id: 'choice-overload-satisfaction',
    queryLanguage: 'ja',
    relation: 'contradicts',
    queries: {
      relate:
        '選択肢は多いほど好みに合うものを見つけやすい。商品数を増やせば、どんな状況でも満足度は必ず高くなる。',
      ask: '選択肢を増やすことは、常に意思決定の満足度を高めるのか。',
    },
    evidence: {
      zh: {
        necessary:
          '当选项差异细小、比较成本高时，消费者更容易推迟决定，并在购买后担心未选方案可能更好。',
        hardNegative: '商店把同一商品的颜色选项排成渐变顺序，货架看起来更整齐。',
      },
      en: {
        necessary:
          'A broad menu helped experts who knew their criteria, but novices reported lower confidence when dozens of unfamiliar plans had to be compared.',
        hardNegative:
          'The survey software allows researchers to randomize the order of answer choices.',
      },
      ja: {
        necessary:
          '時間制限のある場面では候補数の増加が情報処理負荷を高め、少数に整理した条件より選択放棄が増えた。',
        hardNegative: 'レストランは季節限定メニューの写真を入口に追加した。',
      },
    },
  },
  {
    id: 'interval-training-efficiency',
    queryLanguage: 'ja',
    relation: 'same',
    queries: {
      relate:
        '短い高強度運動と回復を交互に行う方法なら、長時間の一定運動より短い時間でも心肺機能を改善できる場合がある。',
      ask: 'インターバルトレーニングは、限られた運動時間でも心肺機能の改善に役立つか。',
    },
    evidence: {
      zh: {
        necessary:
          '久坐成年人每周进行三次短间歇训练后，最大摄氧量得到改善，而单次课程时间明显少于持续耐力组。',
        hardNegative: '健身房把间歇计时器的提示音改得更响，以便学员听清。',
      },
      en: {
        necessary:
          'Alternating hard cycling bouts with recovery periods produced aerobic adaptations despite a lower total duration than moderate continuous sessions.',
        hardNegative:
          'A sports watch displays recovery periods as blue blocks on its workout screen.',
      },
      ja: {
        necessary:
          '短時間の高負荷区間を体力に合わせて反復した群では、数週間後に運動時の酸素利用効率が向上した。',
        hardNegative: 'トレーニング施設では、自転車型機器のサドルを新しい素材に交換した。',
      },
    },
  },
  {
    id: 'census-category-change',
    queryLanguage: 'ja',
    relation: 'complements',
    queries: {
      relate:
        '二つの国勢調査を比べると、ある職業の人数が十年間で大きく増えている。産業そのものが急成長したと考えられる。',
      ask: '年代の異なる国勢調査から職業人口の変化を読む際、数値以外に何を確認すべきか。',
    },
    evidence: {
      zh: {
        necessary:
          '后一次普查把原先分散在多个类别中的照护工作合并为新职业代码，表面增长的一部分来自分类口径变化。',
        hardNegative: '人口普查员使用了颜色更醒目的证件套，方便居民辨认。',
      },
      en: {
        necessary:
          'Changes in question wording and whether respondents could select multiple occupations can break comparability even when column names look alike.',
        hardNegative: 'The census website released historical tables in a new spreadsheet format.',
      },
      ja: {
        necessary:
          '調査対象地域の境界や集計単位が改編されていれば、同じ地名の人数をそのまま時系列比較することはできない。',
        hardNegative: '古い調査票の表紙には、当時の国章が大きく印刷されている。',
      },
    },
  },
  {
    id: 'calorie-label-behavior',
    queryLanguage: 'ja',
    relation: 'contradicts',
    queries: {
      relate:
        'メニューにカロリーを表示すれば、客は必ず低カロリーの商品を選ぶ。表示だけで食生活全体を大きく改善できるはずだ。',
      ask: 'カロリー表示だけで、すべての利用者の選択を大きく変えられるのか。',
    },
    evidence: {
      zh: {
        necessary:
          '菜单标示后的平均购买热量只小幅下降，且许多顾客没有注意数字，效果因健康目标和就餐场景而异。',
        hardNegative: '餐厅把热量数字印成粗体后，菜单的印刷成本略有增加。',
      },
      en: {
        necessary:
          'Customers often compensated for a lower-calorie entrée with drinks or desserts, so the meal’s total energy did not necessarily fall.',
        hardNegative:
          'A recipe database corrected the calorie estimate for one discontinued sandwich.',
      },
      ja: {
        necessary:
          '数値を判断する基準や選びやすい代替品がない店舗では、表示導入後も注文構成にほとんど変化がなかった。',
        hardNegative: 'メニュー表の写真を撮る客が増えたため、店は照明の反射を抑えた。',
      },
    },
  },
  {
    id: 'cache-read-latency',
    queryLanguage: 'ja',
    relation: 'same',
    queries: {
      relate:
        '頻繁に読む同じデータを近い場所にキャッシュすれば、毎回遠いストレージへ取りに行く必要がない。待ち時間を短縮できる。',
      ask: '再利用率の高いデータをキャッシュすることは、読み取り遅延の削減に有効か。',
    },
    evidence: {
      zh: {
        necessary:
          '服务把高频配置保存在进程内后，大多数请求不再访问远程数据库，响应时间的中位数显著下降。',
        hardNegative: '缓存管理页面把容量单位从KB改成MB，数值更容易阅读。',
      },
      en: {
        necessary:
          'A content-delivery cache served repeated assets from a nearby edge node, removing a full origin round trip for cache hits.',
        hardNegative: 'The storage vendor renamed its premium support plan to Rapid Response.',
      },
      ja: {
        necessary:
          '同一計算結果を有効期限付きで再利用すると、参照のたびに重い集計を実行する場合より画面表示が速くなった。',
        hardNegative: '開発者はキャッシュ用フォルダのアイコンを黄色に変更した。',
      },
    },
  },
  {
    id: 'model-size-factuality',
    queryLanguage: 'ja',
    relation: 'contradicts',
    queries: {
      relate:
        '言語モデルは大きいほど知識量も増える。規模を拡大すれば、どの質問でも事実誤認は必ず減るはずだ。',
      ask: 'モデル規模の拡大だけで、あらゆる領域の事実性を保証できるのか。',
    },
    evidence: {
      zh: {
        necessary:
          '更大的模型在通用问答上得分更高，却仍会对训练资料稀少的地方性法规生成流畅但不存在的条款。',
        hardNegative: '新模型的下载文件更大，因此首次安装需要更多磁盘空间。',
      },
      en: {
        necessary:
          'Scaling improved recall, but factual accuracy still depended on retrieval quality, current context, and whether an answer could be verified.',
        hardNegative: 'The model card uses a larger font for the benchmark table headings.',
      },
      ja: {
        necessary:
          '高性能モデルでも最新情報を持たなければ古い役職者名を自信ありげに答え、規模だけでは更新時点の問題を解消できない。',
        hardNegative: '開発チームはモデル名を短くして、設定画面に収まりやすくした。',
      },
    },
  },
  {
    id: 'date-label-food-waste',
    queryLanguage: 'ja',
    relation: 'same',
    queries: {
      relate:
        '賞味期限を過ぎた食品は直ちに危険だと思い、見た目や保存状態に関係なく捨てる人が多い。表示の意味を分けた方がよい。',
      ask: '消費期限と賞味期限の違いを明確に伝えることは、不要な食品廃棄を減らせるか。',
    },
    evidence: {
      zh: {
        necessary:
          '零售商区分安全期限与品质期限并说明保存条件后，消费者不再把所有到期标示都理解为立即不可食用。',
        hardNegative: '食品包装把日期字体加粗后，仓库人员能更快按批次整理货架。',
      },
      en: {
        necessary:
          'Clearer wording around quality and safety dates reduced disposal of unopened food that remained suitable beyond a best-before date.',
        hardNegative:
          'The label printer places the date beside the barcode so both fit on the front panel.',
      },
      ja: {
        necessary:
          '品質の目安と安全上の期限を区別した案内により、期限表示だけを理由に未開封品を捨てる世帯が減った。',
        hardNegative: '期限表示を西暦に統一すると、輸入商品のラベルを並べやすくなった。',
      },
    },
  },
  {
    id: 'language-revival-daily-use',
    queryLanguage: 'ja',
    relation: 'complements',
    queries: {
      relate:
        '少数言語の授業を学校に設ければ、話者数の減少は止められそうだ。子どもが学ぶ機会を増やすことが第一歩になる。',
      ask: '少数言語を次世代へ継承するには、学校教育に加えて何が必要か。',
    },
    evidence: {
      zh: {
        necessary:
          '语言只有进入家庭对话、社区活动和本地媒体，儿童才能在课堂之外把它当作处理日常生活的真实工具。',
        hardNegative: '学校把少数语言课程排在上午后，教师不再需要跨校赶晚班车。',
      },
      en: {
        necessary:
          'Intergenerational use, public services, and contemporary media gave learners reasons and places to speak the language after lessons ended.',
        hardNegative:
          'The language department printed a larger map showing where each classroom is located.',
      },
      ja: {
        necessary:
          '家庭内で話す大人、地域の仕事、放送や創作の場が結び付かなければ、授業で覚えた言葉は日常の使用へ移りにくい。',
        hardNegative: '語学教室の案内板を二言語表記にし、来校者が受付を見つけやすくした。',
      },
    },
  },
] as const satisfies readonly SemanticRetrievalScenario[];
