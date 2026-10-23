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
ID、名称和坐标都来自 Polestar 自己的游戏数据。最后得到一个社区攻略包,
可以用 Polestar 的工具检查、在模拟器里跑完,并安装到游戏里。

所有内容都留在你的电脑上。转换器用 Node 在本地运行,没有任何依赖,
并会报告所有被删掉、被弱化或无法定位的内容,方便你检查。

## 快速开始

需要魔兽世界:Forever,以及在 `Interface/AddOns` 里至少装有一个攻略插件(RestedXP、Journey 或 Zygor)。
转换后的攻略包需要 Polestar 0.3.0:在它正式发布之前,请使用 Polestar 的 `next` 分支,
并从克隆的目录安装到游戏里(需要 **Node 24 或更新版本**,例如从 nodejs.org 下载安装包,以及 **Git**)。
在中国大陆访问 GitHub 或 nodejs.org 可能较慢,可以使用镜像或代理。

**1. 获取 Polestar 及其游戏数据(只需一次)。**

```sh
git clone -b next https://github.com/fitzforge/polestar
cd polestar
node tools/polestar.js data build        # 找不到 QuestieDB 时加上 --questie "<WoW>/Interface/AddOns"
node tools/polestar.js profession build  # 专业技能等级和配方,供训练步骤使用
node tools/polestar.js install           # 把这个 Polestar 安装到游戏里
cd ..
```

**2. 转换你的攻略。** 两种方式得到的攻略包相同。

*在浏览器里:* 打开 **[aronjanosch.github.io/polestar-convert](https://aronjanosch.github.io/polestar-convert/)**,
选择你的 `Interface/AddOns` 文件夹,勾选想要的 RestedXP 路线,把攻略包下载为 ZIP。
网页在浏览器里读取你的攻略文件,不会上传任何内容。把攻略包解压到 `polestar` 文件夹旁边,然后:

```sh
cd my-guides
node ../polestar/tools/polestar.js lint      # 用游戏数据检查每个攻略
node ../polestar/tools/polestar.js install   # 编译攻略包并安装到游戏里
```

浏览器版不包含 RestedXP 的中文译文(游戏内名称仍按客户端语言显示);想要中文攻略文本,请用下面的命令。

*或者用一条命令:* `<WoW>` 是你的魔兽世界文件夹,例如
`C:\Program Files (x86)\World of Warcraft`(其中的 `_forever_` 文件夹或它的 `Interface/AddOns` 也可以)。

```sh
npx github:aronjanosch/polestar-convert --path "<WoW>" --locales zhCN --install
```

在包含 `polestar` 克隆目录的文件夹里运行,或者用 `--polestar <文件夹>` 指定克隆目录。

它会找到 RestedXP、Journey 和 Zygor,询问你要哪些 RestedXP 路线(用 `--routes main,dungeon,survival` 可跳过询问;
你的攻略里没有的路线会被略过),新建攻略包 `polestar-guides`,转换全部攻略并写入中文译文,
检查后安装。去掉 `--install` 可以先看一看。

完全重启游戏。你的攻略会出现在 Polestar 攻略中心(`/polestar guides`)的“社区攻略”里。

lint 会报告一些警告(需要组队的精英、没有已知刷新点的目标),这是正常的。
只有错误才会阻止 `install`。

**手边没有游戏?** 在攻略包目录里运行 `node ../polestar/tools/polestar.js play`,
会在浏览器里打开 Polestar:真正的插件加载了你的攻略包,运行在模拟的世界中。
在攻略中心选一个攻略,像在游戏里一样逐步点击。

### 一次转换一个插件

单独的命令把一个插件转换进你用 `node polestar/tools/polestar.js new my-pack --id my-pack --yes`
新建的攻略包,选项更多(见下表):

```sh
npx github:aronjanosch/polestar-convert rxp --list "<WoW>/_forever_/Interface/AddOns/RXPGuides/Guides/GuideList-forever.xml" --polestar polestar --pack my-pack --locales zhCN
npx github:aronjanosch/polestar-convert journey --dir "<WoW>/_forever_/Interface/AddOns/Journey" --polestar polestar --pack my-pack
npx github:aronjanosch/polestar-convert zygor --dir "<WoW>/_forever_/Interface/AddOns/ZygorGuidesViewerClassic" --polestar polestar --pack my-pack
```

> [!TIP]
> `--only "<攻略名称>"` 只转换一个攻略,试用时快得多。每次运行都会打印一份报告:
> 哪些被删掉,哪些变成了任务或备注,哪些需要人工查看。


## 覆盖率

原版有多少内容被完整转换,2026-10-23 针对 Polestar `next` 772b2065 测得:

| 来源 | 版本 | 攻略 | 原版步骤 | 无记录损失地转换 |
|---|---|---|---|---|
| RestedXP | 4.11.26 | 271 | 32,914 | **97 %** |
| Zygor(试用) | 8.1 | 6 | 1,468 | **92 %** |
| Journey | 4.00.02 | 37 | 2,945 | **71 %** |

报告里没有任何记录的步骤才算(原版对谁都不显示的步骤除外)。大多数记录是弱化而不是丢失:
Polestar 无法表达的条件(Zygor 的 `indoors`)、Journey 每步的变体按常规情况读取、需要手动勾选的目标。
各来源报告的详细程度不同(Journey 和 Zygor 逐步列出每处弱化,RestedXP 较少),所以这些数字只是初步衡量,
不是排名;人工审查 24 个 RestedXP 攻略,约 95% 的步骤正确。所有 lint 均为 0 错误。

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
命令行会把这些译文写进攻略包(默认 `--locales all`,或 `--locales zhCN`);浏览器版不包含译文。

- 每种语言第一次运行时,会从 wago.tools(公开的游戏数据)下载客户端的区域、地图和法术名称,
  保存到 Polestar 目录下被 git 忽略的 `data/sources/wago/`。不会上传任何攻略内容。
- 已经有译文的行不会被修改,所以你自己的修正在重新运行后仍会保留。转换器自己填写的行也算“已有译文”:
  想采用 RXP 更新的翻译或转换器的修复,请删除攻略包里的 `locales/<locale>/` 文件夹
  (你自己在其中的修改会丢失),然后重新运行。
- 攻略包里的 `reports/rxp-locales.json` 按语言记录:文本总数、已翻译数,以及仍是英文的原因。

仍是英文的内容:

- Journey 和 Zygor 自己的攻略文字(与 RXP 逐字相同的句子可能会显示为译文)。
- 没能和翻译版对上的 RXP 文本,以及 RXP 自己标为 “NOT TRANSLATED” 的文本。
- RXP 没有提供翻译版的攻略文件。
- 游戏还没有显示过名称的新 Forever NPC:在译文句子里会显示英文名,直到玩家看到或选中过它一次。

## 已知问题

- **步骤编号**会把所有职业的步骤都算上(“3 / 72”);RestedXP 只算你自己的。需要 Polestar 修改。
- **有些条件在 Polestar 里没有对应写法**(Zygor 的 `walking`、`indoors`、增益效果;
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
任何攻略内容都不会离开你的电脑,命令行和浏览器版都一样:网页只在浏览器里读取你选择的文件夹,只从自己的网站下载 Polestar 的游戏数据。开启翻译时,命令行每种语言第一次运行会从 wago.tools 下载客户端公开的地点和法术名称。

**某一步被跳过、重复或缺失,是 bug 吗?**
先看运行时的报告和攻略包里的 `reports/`:很多区别是有意的(见上文)。
如果仍然不对,请提交 [issue](https://github.com/aronjanosch/polestar-convert/issues),
写明攻略名称、步骤以及原版是怎么做的。

**有不需要 Node 和 Git 的版本吗?**
转换可以:用[浏览器版](https://aronjanosch.github.io/polestar-convert/)。在 Polestar 0.3.0 发布之前,安装攻略包仍需从 Polestar 的克隆目录运行它的工具。

## 文档

| 页面 | 内容 |
|---|---|
| [docs/rxp.md](../rxp.md) | RestedXP 的每行如何变成 Polestar 目标,以及 RestedXP 的已知问题 |
| [docs/zygor.md](../zygor.md) | Zygor 的步骤如何变成 Polestar 步骤 |
| [docs/journey/](../journey/format.md) | Journey 的格式、转换器的变通做法、Polestar 缺少的功能 |
| [docs/translations.md](../translations.md) | RestedXP 翻译攻略在攻略包里的处理 |
| [docs/web.md](../web.md) | 浏览器版:工作方式、游戏数据、发布 |
| [docs/development.md](../development.md) | 代码结构、测试、检查攻略包、添加新来源 |

文档均为英文。

## 许可证

转换器采用 [MIT](../../LICENSE) 许可证。它不含任何攻略内容,也不含 Polestar 的代码;
你转换的攻略保留它们自己的许可证。浏览器版加载的游戏数据是 Polestar 数据构建的副本,
因为包含 QuestieDB 的数据而单独以 GPLv3 发布([说明](https://aronjanosch.github.io/polestar-convert/polestar-data/NOTICE.md))。提到 RestedXP、Journey、Zygor 和 Polestar
只是为了说明本工具读取和写出什么,不主张任何商标权利。
