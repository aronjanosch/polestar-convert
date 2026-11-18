// The converter's own words (not a guide's) in each language: its sentences, by a
// key's shape as fill.mjs writes it ("{npc} is elite...") with {#n} for the key's
// n-th token, and in `lang` how it lists names ([separator, last word]) and ends a sentence.

const ELITE = "is elite: grouping up is advised.";

export const OWN = {
	zhCN: {
		sentences: {
			[`{npc} ${ELITE}`]: "{#0}是精英怪，建议组队。",
			[`{quest} ${ELITE}`]: "{#0}是精英任务，建议组队。",
			"Stable your pet": "把宠物寄存到兽栏",
			"Train at your class trainer": "到职业训练师处训练",
			"Train your profession": "训练你的专业技能",
			"Learn new weapon skills at a weapon master": "到武器大师处学习新的武器技能",
			"Destroy {item}": "摧毁{#0}",
			"Cast {spell}": "施放{#0}",
			"Use {item}": "使用{#0}",
			"Click Here to Continue": "点击此处继续",
			"Journey offers to skip this step: use Skip if you want to.": "Journey 允许跳过这一步：想跳过就点“跳过”。",
		},
		lang: { and: ["、", "和"], or: ["、", "或"], stop: "。" },
	},
};
