-- Invented mini names pack for tests.
local add = Polestar and Polestar.Names and Polestar.Names.Add
if not add then return end

add("zhCN", "npc", {
[1]="鲍勃",
[2]="说\"你好\"的人",
})

add("zhCN", "npc", {
[3]="第二块",
})

add("zhCN", "item", {
[7]="测试剑",
})

add("zhCN", "quest", {
[9]="第一行\n第二行\\",
})
