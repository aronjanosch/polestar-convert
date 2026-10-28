<div align="center">

[English](../../README.md) · **简体中文**

# polestar-convert

### 把你的 RestedXP、Journey 和 Zygor 攻略放进 Polestar 里玩。

**在你自己的电脑上,把你已经拥有的练级攻略转换成 [Polestar](https://github.com/fitzforge/polestar) 攻略包。**

[![MIT 许可证](https://img.shields.io/badge/许可证-MIT-e6ba66?style=flat-square&labelColor=232a3f)](../../LICENSE)
[![Node.js 24+](https://img.shields.io/badge/Node.js-24%2B-339933?style=flat-square&logo=nodedotjs&logoColor=white&labelColor=232a3f)](https://nodejs.org/)
[![Polestar 0.3.0+](https://img.shields.io/badge/Polestar-0.3.0%2B-94c9ff?style=flat-square&labelColor=232a3f)](https://github.com/fitzforge/polestar)
[![魔兽世界:Forever](https://img.shields.io/badge/WoW-Forever-fabf4d?style=flat-square&labelColor=232a3f)](#快速开始)
[![来源:RestedXP、Journey、Zygor](https://img.shields.io/badge/来源-RestedXP_·_Journey_·_Zygor-f16436?style=flat-square&labelColor=232a3f)](#快速开始)

[快速开始](#快速开始) · [与原版的区别](#与原版的区别) · [中文翻译](#中文翻译) · [已知问题](#已知问题) · [常见问题](#常见问题) · [文档](#文档)

</div>

> [!IMPORTANT]
> **非官方工具。** polestar-convert 不是 RestedXP、Journey、Zygor 或 Polestar
> 制作的,也没有得到它们的认可或支持。转换后的攻略有问题,请在
> [这里](https://github.com/aronjanosch/polestar-convert/issues)反馈,不要找它们。
>
> **本工具不含任何攻略内容。** 它读取*你自己*安装的攻略插件,把结果写进*你自己*电脑上的攻略包。
> 攻略是作者的劳动成果:转换后的攻略包请只自己使用,不要分享。
>
> **只转换你有权使用的攻略:** 免费攻略,或许可证允许的攻略。本工具无法判断;转换什么由你自己负责。

---

你喜欢某个攻略插件的路线,但想用 Polestar 的箭头、自动交接任务、旅行规划和攻略中心来玩。
polestar-convert 读取该插件的攻略文件,把每一步写成 Polestar 的 `.guide` 格式,
ID、名称和坐标都来自 Polestar 自己的游戏数据,再用 Polestar 自己的编译器
生成一个插件,你把它复制进游戏即可。

你的攻略不会离开你的电脑。转换器在本地运行(浏览器里或用 Node),
并会报告所有被删掉、被弱化或无法定位的内容,方便你检查。

## 快速开始

需要魔兽世界:Forever,`Interface/AddOns` 里装有 **Polestar 0.3.0 或更新版本**
(0.3.0 正式发布之前,请按 Polestar 的说明安装它的 `next` 分支),以及至少一个攻略插件:
RestedXP、Journey 或 Zygor。别的都不需要:不用克隆,也不用构建游戏数据。

**在浏览器里:** 打开 **[aronjanosch.github.io/polestar-convert](https://aronjanosch.github.io/polestar-convert/)**,
选择你的 `Interface/AddOns` 文件夹,勾选攻略插件和 RestedXP 路线,RestedXP 还可以选择语言(中文),
确认你只转换有权使用的攻略,然后下载 ZIP。把它解压到 `World of Warcraft/_forever_/Interface/AddOns`。
浏览器允许时(Chrome、Edge),网页会直接把文件夹放进去。网页只在浏览器里读取你的攻略文件,不会上传任何内容。

**或者用一条命令**(需要 **Node 24 或更新版本**,例如从 nodejs.org 下载安装包):`<WoW>` 是你的魔兽世界文件夹,例如
`C:\Program Files (x86)\World of Warcraft`(其中的 `_forever_` 文件夹或它的 `Interface/AddOns` 也可以)。

```sh
npx github:aronjanosch/polestar-convert --path "<WoW>" --locales zhCN --install
```

它会找到 RestedXP、Journey 和 Zygor(某个阵营没有安装 Zygor 完整攻略时,读取查看器自带的免费试用攻略),
询问你要哪些 RestedXP 路线(用 `--routes main,dungeon,survival` 可跳过询问;你的攻略里没有的路线会被略过),
转换全部攻略并写入中文译文,然后把插件放进游戏。去掉 `--install` 时,文件夹会写到 `./polestar-addon`,
可以先看一看。`--name "My Guides"` 设定插件的名称。
在中国大陆访问 GitHub、github.io 或 nodejs.org 可能较慢,可以使用镜像或代理。

两种方式生成的插件相同:由 Polestar 自己的编译器(以 WebAssembly 运行)用网站托管的游戏数据
([GPLv3](#许可证))从转换后的攻略生成。编译器的警告(需要组队的精英、没有已知刷新点的目标)是正常的,
只有错误才会阻止生成。完全重启游戏后,你的攻略会出现在 Polestar 攻略中心(`/polestar guides`)的“社区攻略”里。

### 开发转换器

单独的命令把 `.guide` 文件写进用 Polestar 的 `new` 新建的攻略包,供它的 `lint`、`playtest` 和 `play` 使用
(需要构建过数据的 Polestar 克隆目录),选项更多(例如 `--only "<攻略名称>"`):

```sh
npx github:aronjanosch/polestar-convert rxp --list "<WoW>/_forever_/Interface/AddOns/RXPGuides/Guides/GuideList-forever.xml" --polestar polestar --pack my-pack
npx github:aronjanosch/polestar-convert journey --dir "<WoW>/_forever_/Interface/AddOns/Journey" --polestar polestar --pack my-pack
npx github:aronjanosch/polestar-convert zygor --dir "<WoW>/_forever_/Interface/AddOns/ZygorGuidesViewerClassic" --polestar polestar --pack my-pack
```

## 覆盖率

原版有多少内容被完整转换,2026-10-23 针对 Polestar `next` 772b2065 测得:

| 来源 | 版本 | 攻略 | 原版步骤 | 无记录损失地转换 |
|---|---|---|---|---|
| RestedXP | 4.11.26 | 271 | 32,914 | **97 %** |
| Zygor | 8.1 | 733 | 13,984 | **97 %** |
| Journey | 4.00.02 | 37 | 2,945 | **71 %** |

报告里没有任何记录的步骤才算(原版对谁都不显示的步骤除外)。大多数记录是弱化而不是丢失:
Polestar 无法表达的条件(Zygor 的增益效果检查)、Journey 每步的变体按常规情况读取、需要手动勾选的目标。
各来源报告的详细程度不同(Journey 和 Zygor 逐步列出每处弱化,RestedXP 较少),所以这些数字只是初步衡量,
不是排名;人工审查 24 个 RestedXP 攻略,约 95% 的步骤正确。所有 lint 均为 0 错误。

RestedXP 攻略文字的中文翻译(zhCN),2026-10-25 用相同版本、全部三条路线测得:14,503 条文本中
**63 %** 完整翻译,另有 4 % 部分翻译。其余是 RXP 在任何攻略里都没有翻译过的文字;
游戏内名称在所有地方都显示中文。

## 与原版的区别

路线、任务和文字来自原版;每一步怎么运行由 Polestar 决定。所有取舍背后的规则:
**原版显示的步骤,在 Polestar 里会一直保留,直到完成、勾选或跳过。不会有步骤悄悄略过。**

- **玩法固定。** 原版会根据单人或组队、普通或硬核、自给自足与否实时挑选步骤。
  转换器只写一种玩法:普通模式,可以用拍卖行。组队任务会保留,Polestar 在游戏里按任务询问你。
- **路线旁的目标**(RestedXP 的 `#completewith`、Zygor 的 sticky 步骤):Polestar
  能自动勾选的放进“顺路完成”列表,不能的变成单独的步骤或需要你手动勾选的任务。
- **Polestar 没有对应目标的命令**(装备物品、利用死亡赶路、银行)会变成你手动勾选的任务。
- **打怪和刷怪的路径点**会被省略:Polestar 自己找刷怪点(“下一个地点”)。地点之间的路线会保留。
- **ID、名称和坐标都来自 Polestar 的数据**,从不凭记忆填写。任务目标按名称匹配,
  因为各来源对目标的编号不同。

各来源的详细说明(英文):[RestedXP](../rxp.md)、[Zygor](../zygor.md)、
[Journey](../journey/polestar-gaps.md)。

## 中文翻译

对所有来源,Polestar 都用客户端的语言显示游戏内名称(NPC、任务、物品、地点、法术)。
RestedXP 还提供翻译过的攻略(德语、西班牙语、法语、巴西葡萄牙语、中文),
译文作为一个语言插件放在主插件旁边(`<插件>_zhCN`),Polestar 在该语言的客户端上加载它。
网页添加你在网页上选择的语言,命令行默认添加 RestedXP 提供的全部语言(`--locales zhCN` 只要中文)。

- 某个攻略自己的译文缺少某一行时(RXP 没有提供翻译版的攻略文件、漏掉的步骤、标为 “NOT TRANSLATED” 的文本),
  会从 RXP 在任何其他攻略里(包括其他游戏版本的攻略)对同一行的译文中取用。
- 翻译版攻略按英文原文转换:旅店、商人、训练师、等级目标和步骤标题都与英文攻略一致,
  所以每条译文都能对上它的英文原文。
- RXP 译者写法不同的名称也能对上:按方括号(`[...]`)的位置,或与游戏名称只差一个字的唯一位置。
- 对不上的文本会套用同样句式的译文:“Talk to {npc}” 只要翻译过一次,就适用于所有 NPC;
  复数形式的名称按单数处理,名称列表(“A、B 和 C”)按一个名称处理;多行或多句的文本逐行、逐句填写。
  只找到部分行的文本,其余行保留英文,报告里记为 “partly translated”。
- 转换器自己写的句子(精英提示、它自己生成的任务)带有中文译文。
- 命令行的 `reports/rxp-locales.json` 按语言记录:文本总数、完整或部分翻译的数量,以及仍是英文的原因。

仍是英文的内容:

- Journey 和 Zygor 自己的攻略文字(与 RXP 相同的句子可能会显示为译文)。
- RXP 在任何攻略里都没有翻译过的文字。
- 游戏还没有显示过名称的新 Forever NPC:在译文句子里会显示英文名,直到玩家看到或选中过它一次。

## 已知问题

- **步骤编号**会把所有职业的步骤都算上(“3 / 72”);RestedXP 只算你自己的。需要 Polestar 修改。
- **有些条件在 Polestar 里没有对应写法**(Zygor 的增益效果、声望和 `equipped` 检查;
  RestedXP 的 `#requires`、银行里的物品)。步骤会保留但不带该条件,报告里会列出。
- **没有标题的步骤**会把第一个目标当作标题,所以只有一个任务的步骤会显示两次。
- **骑术**在 Polestar 里不算专业技能,会被忽略。
- **攻略放弃了一个你已经做过部分目标的任务时**,Polestar 0.3.0 可能把你送回该任务之前的步骤。跳过它即可。
  已向 Polestar 提交修复建议。
- **精英任务**会像 RestedXP 和 Zygor 里一样留在路线中,并提示组队。不想做就跳过该步骤。

完整列表(英文):[RestedXP](../rxp.md#known-gaps)、
[Journey](../journey/polestar-gaps.md)、[Zygor](../zygor/polestar-gaps.md)。

## 常见问题

**这是官方工具吗?**
不是。这是社区工具,不是 RestedXP、Journey、Zygor 或 Polestar 制作或支持的。

**可以分享转换后的攻略包吗?**
只有在攻略的许可证允许时才可以。攻略是作者的劳动成果:
本工具的目的是让你用 Polestar 玩你有权使用的攻略。

**它会上传什么东西吗?**
任何攻略内容都不会离开你的电脑,命令行和浏览器版都一样:网页只在浏览器里读取你选择的文件夹,两者都只从本项目的网站下载游戏数据和 Polestar 的编译器(命令行会把它们缓存起来)。

**某一步被跳过、重复或缺失,是 bug 吗?**
先看运行时的报告和攻略包里的 `reports/`:很多区别是有意的(见上文)。
如果仍然不对,请提交 [issue](https://github.com/aronjanosch/polestar-convert/issues),
写明攻略名称、步骤以及原版是怎么做的。

**需要 Node、Git 或 Polestar 克隆目录吗?**
不需要:[浏览器版](https://aronjanosch.github.io/polestar-convert/)直接给出现成的插件。命令行只需要 Node。游戏的 AddOns 文件夹里需要装有 Polestar 本身。

## 文档

| 页面 | 内容 |
|---|---|
| [docs/rxp.md](../rxp.md) | RestedXP 的每行如何变成 Polestar 目标,以及 RestedXP 的已知问题 |
| [docs/zygor.md](../zygor.md) | Zygor 的步骤如何变成 Polestar 步骤 |
| [docs/journey/](../journey/format.md) | Journey 的格式、转换器的变通做法、Polestar 缺少的功能 |
| [docs/translations.md](../translations.md) | RestedXP 翻译攻略在攻略包里的处理 |
| [docs/web.md](../web.md) | 浏览器版:工作方式、游戏数据、发布 |
| [docs/development.md](../development.md) | 代码结构、测试、检查攻略包、添加新来源 |
| [CHANGELOG.md](../../CHANGELOG.md) | 每个版本带来什么 |

文档均为英文。

## 许可证

转换器采用 [MIT](../../LICENSE) 许可证,不含任何攻略内容;你转换的攻略保留它们自己的许可证。
它的编译器(`wasm/`)是 Polestar 的 `forge-guide`,编译为 WebAssembly,与 Polestar 一样采用 GPL-3.0。
网页和命令行加载的游戏数据是 Polestar 数据构建的副本,因为包含 QuestieDB 的数据而以 GPLv3 发布([说明](https://aronjanosch.github.io/polestar-convert/polestar-data/NOTICE.md))。提到 RestedXP、Journey、Zygor 和 Polestar
只是为了说明本工具读取和写出什么,不主张任何商标权利。
