-- Invented mini names pack for tests, in the chunks `forge data names` writes.
local N = Polestar and Polestar.Names
if not (N and N.AddChunk) then return end
local function R(kind, lo, hi, text) N.AddChunk("zhCN", kind, lo, hi, text) end
R("npc", 1, 2, [[
1	鲍勃
2	说"你好"的人
]])
R("npc", 3, 3, [[
3	第二块
]])
R("item", 7, 7, [[
7	测试剑
]])
R("quest", 9, 9, [==[
9	第一行%0A第二行]]%25
]==])
