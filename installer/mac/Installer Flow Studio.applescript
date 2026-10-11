-- Installer Flow Studio — application à double-cliquer. Aucune commande, aucun fichier texte.
property guiPath : ""
property answerPath : ""

on run
	set home to POSIX path of (path to home folder)
	set guiPath to home & ".flow-bridge/gui.txt"
	set answerPath to home & ".flow-bridge/gui-answer.txt"
	set runner to (POSIX path of (path to me)) & "Contents/Resources/runner.sh"
	
	try
		display dialog "Flow Studio va vérifier ce Mac et installer ce qui manque : un moteur de motion design, Claude Code et les outils de montage." & return & return & "Tu n'as rien à taper. Prévois quelques minutes." with title "Flow Studio" buttons {"Annuler", "Installer"} default button "Installer" cancel button "Annuler" with icon note
	on error number -128
		return
	end try
	
	do shell script "mkdir -p ~/.flow-bridge && rm -f " & quoted form of guiPath & " " & quoted form of answerPath
	do shell script "nohup " & quoted form of runner & " >/dev/null 2>&1 &"
	
	set progress total steps to 100
	set progress completed steps to 0
	set progress description to "Installation de Flow Studio"
	set progress additional description to "Préparation…"
	
	set lastCode to ""
	set lastAsk to ""
	repeat
		delay 1
		set g to my readGui()
		if g is not "" then
			set ph to my valueFor("phase", g)
			set stepText to my valueFor("step", g)
			set pctText to my valueFor("pct", g)
			try
				set progress completed steps to (pctText as integer)
			end try
			if stepText is not "" then set progress additional description to stepText
			
			set askText to my valueFor("ask", g)
			if askText is not "" and askText is not lastAsk then
				set lastAsk to askText
				my answerQuestion(askText)
			end if
			
			set codeText to my valueFor("code", g)
			set urlText to my valueFor("url", g)
			if codeText is not "" and urlText is not "" and codeText is not lastCode then
				set lastCode to codeText
				open location urlText
			end if
			
			if ph is "done" then
				set progress completed steps to 100
				display dialog stepText & return & return & "Retourne sur Flow : ton Mac est relié. Tu peux fermer cette fenêtre." with title "Flow Studio" buttons {"OK"} default button "OK" with icon note
				exit repeat
			else if ph is "error" then
				set errText to my valueFor("error", g)
				try
					set r to display dialog "L'installation n'a pas pu se terminer." & return & return & errText with title "Flow Studio" buttons {"Voir le journal", "Fermer"} default button "Fermer" with icon caution
					if button returned of r is "Voir le journal" then do shell script "open -a TextEdit ~/.flow-bridge/installer.log"
				end try
				exit repeat
			end if
		end if
	end repeat
end run

on readGui()
	try
		return do shell script "cat " & quoted form of guiPath
	on error
		return ""
	end try
end readGui

on valueFor(k, txt)
	set AppleScript's text item delimiters to linefeed
	set ls to text items of txt
	set AppleScript's text item delimiters to ""
	repeat with l in ls
		set lt to l as text
		if lt starts with (k & "=") then return text ((length of k) + 2) thru -1 of lt
	end repeat
	return ""
end valueFor

-- ask = "id|question|Libellé~valeur;;Libellé~valeur"
on answerQuestion(askText)
	set AppleScript's text item delimiters to "|"
	set parts to text items of askText
	set AppleScript's text item delimiters to ""
	set qid to item 1 of parts
	set qtext to item 2 of parts
	set AppleScript's text item delimiters to ";;"
	set opts to text items of (item 3 of parts)
	set AppleScript's text item delimiters to ""
	set labels to {}
	set values to {}
	repeat with o in opts
		set AppleScript's text item delimiters to "~"
		set kv to text items of (o as text)
		set AppleScript's text item delimiters to ""
		set end of labels to item 1 of kv
		set end of values to item 2 of kv
	end repeat
	set picked to choose from list labels with prompt qtext with title "Flow Studio" default items {item 1 of labels} OK button name "Continuer" cancel button name "Annuler l'installation"
	if picked is false then
		do shell script "pkill -f flow-bridge.mjs; pkill -f runner.sh; true"
		do shell script "printf 'phase=error\nerror=Installation annulée.\n' > " & quoted form of guiPath
		return
	end if
	repeat with i from 1 to count of labels
		if item i of labels is (item 1 of picked) then
			do shell script "printf '%s=%s\n' " & quoted form of qid & " " & quoted form of (item i of values) & " > " & quoted form of answerPath
			exit repeat
		end if
	end repeat
end answerQuestion
