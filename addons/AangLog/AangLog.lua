-- AangLog: the combat log on in dungeons and raids, off everywhere else. Nothing more.
--
-- Aang's rotation coach reads Logs\WoWCombatLog-*.txt after the fight (the game writes it, addons can't read
-- combat numbers on this engine). This addon only flips the game's own logging switch. LoggingCombat() is
-- public and silent (the chat line comes from the /combatlog slash command, not the function), but it is
-- rate-limited to 5 calls per 10 s, so it is only called when the state actually needs to change.

local function getCVar(name)
  if C_CVar and C_CVar.GetCVar then return C_CVar.GetCVar(name) end
  return GetCVar(name)
end

local function setCVar(name, value)
  if C_CVar and C_CVar.SetCVar then return C_CVar.SetCVar(name, value) end
  return SetCVar(name, value)
end

local function wanted()
  local inInstance, kind = IsInInstance()
  return inInstance and (kind == "party" or kind == "raid")
end

local function apply()
  local on = wanted() and true or false
  -- Advanced logging adds spec (COMBATANT_INFO), unit health and positions. Set once, quietly.
  if on and getCVar("advancedCombatLogging") ~= "1" then setCVar("advancedCombatLogging", "1") end
  if (LoggingCombat() and true or false) ~= on then LoggingCombat(on) end
end

local pending = false
local frame = CreateFrame("Frame")
frame:RegisterEvent("PLAYER_ENTERING_WORLD")
frame:RegisterEvent("ZONE_CHANGED_NEW_AREA")
frame:SetScript("OnEvent", function()
  -- Loading screens fire both events together; wait a moment and act once.
  if pending then return end
  pending = true
  C_Timer.After(2, function() pending = false; apply() end)
end)
