# polestar-convert(中文说明)

把**你自己拥有**的练级攻略(RestedXP、Journey、Zygor)转换成本地的
[Polestar](https://github.com/fitzforge/polestar) 攻略包(魔兽世界:Forever)。
本工具不含任何攻略内容:它读取你自己安装的插件,把 `.guide` 文件写进你自己的攻略包。
输出内容请自己使用,不要分享。完整说明见 [README.md](README.md)(英文)。

## 安装

1. 安装 Node 24 或更新版本(例如从 nodejs.org 下载安装包;也可以用 mise 等工具)。
2. 需要已安装 Git。克隆 Polestar 并生成参考数据:

```sh
git clone -b next https://github.com/fitzforge/polestar && cd polestar && node tools/polestar.js data build && cd ..
```

把本仓库也克隆到同一目录。两个文件夹必须分别叫 `polestar` 和 `polestar-convert`,下面的命令按这两个名字写。在中国大陆访问 GitHub 或 nodejs.org 可能较慢,可以使用镜像或代理。找不到 QuestieDB 时,加上 `--questie <WoW>/Interface/AddOns`。

## 转换 RXP 攻略(含中文)

每条命令写成一行,可直接粘贴到 cmd、PowerShell 或 Git Bash:

```sh
node polestar/tools/polestar.js new my-pack --id my-pack --yes
node polestar-convert/bin/polestar-convert.mjs rxp --list "C:\Program Files (x86)\World of Warcraft\_classic_beta_\Interface\AddOns\RXPGuides\Guides\GuideList-forever.xml" --polestar polestar --pack my-pack --locales zhCN
cd my-pack
node ../polestar/tools/polestar.js lint
```

`--locales <all|none|zhCN,deDE,…>`,默认 `all`。RXP 为每种语言(deDE、esES、frFR、ptBR、zhCN)
提供翻译过的攻略,位于 `RXPGuides/lang/Guides-<locale>/GuideList-forever.xml`。转换时,
工具通过 Polestar 的 `i18n guides sync` 填写攻略包里的 `locales/<locale>/` 翻译文件,
再运行 `i18n guides check`。`none` 表示关闭(不同步,也不下载)。

- 每种语言第一次运行时,会从 wago.tools(公开的游戏数据)下载客户端的区域和地图名称以及法术名称,
  保存到 Polestar 目录下被 git 忽略的 `data/sources/wago/`。不会上传任何攻略内容。
- 已经有译文的行不会被修改,所以你自己的修正在重新运行后仍会保留。
- 转换后按上面 README 的方法用 Polestar 编译并安装;编译器会根据 `locales/` 生成该语言的文本插件。
- 攻略包里的 `reports/rxp-locales.json` 按语言记录:文本总数、已翻译数,以及仍是英文的原因(每个攻略附示例)。

## 哪些显示中文

- 游戏内名称(NPC、任务、物品、地点、法术):对所有来源(RXP、Journey、Zygor)都显示中文,
  因为 Polestar 使用客户端自己的名称。
- RXP:RXP 的翻译攻略里有的攻略文字,也显示中文。

## 哪些仍是英文

- Journey 和 Zygor 的攻略文字。
- 没能和翻译版对上的 RXP 文本。
- `a guide file` 里的 RXP 攻略(30–60 级和副本攻略):RXP 没有这个文件的翻译版。
- RXP 自己标为 "NOT TRANSLATED" 的文本。

## 注意

输出内容(转换后的攻略)是攻略作者的劳动成果,请只自己使用,不要分享。
