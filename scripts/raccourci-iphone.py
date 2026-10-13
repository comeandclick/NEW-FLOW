#!/usr/bin/env python3
"""Fabrique et signe le raccourci iPhone « Flow » (Partager -> Flow) : public/raccourci/Flow.shortcut.
La clé API n'est PAS dans le fichier : l'app Raccourcis la demande à l'installation (question d'import), le fichier peut donc
être public. Signature : `shortcuts sign --mode anyone` (Mac connecté à iCloud), obligatoire pour l'import sur iPhone.
v2.1 (13/10/2026, plus d'étape « Combiner le texte » : la liste partait vide) : partagé depuis une app -> note facultative ; lancé depuis l'écran d'accueil -> zone de texte. Puis choix de
un ou plusieurs projets (liste lue dans Flow), « Analyse par l'IA ? », POST /api/v1/captures (JSON pour un lien ou du texte,
formulaire avec le fichier pour une image ou une vidéo), et « Envoyé » SEULEMENT si Flow a créé la capture (sinon son message).
Usage : python3 scripts/raccourci-iphone.py [https://new-flow-dashboard.vercel.app]"""
import os, plistlib, subprocess, sys, tempfile, uuid

BASE = (sys.argv[1] if len(sys.argv) > 1 else "https://new-flow-dashboard.vercel.app").rstrip("/")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "raccourci", "Flow.shortcut")
OBJ = "￼"  # place d'une variable dans un texte


def uid(): return str(uuid.uuid4()).upper()


def sortie(nom, u):  # résultat d'une action précédente (« variable magique »)
    return {"Type": "ActionOutput", "OutputName": nom, "OutputUUID": u}


def jeton(v):  # une variable seule comme paramètre
    return {"Value": v, "WFSerializationType": "WFTextTokenAttachment"}


def texte(avant="", v=None, apres=""):  # texte avec au plus une variable dedans
    val = {"string": avant + (OBJ if v else "") + apres}
    if v: val["attachmentsByRange"] = {"{%d, 1}" % len(avant): v}
    return {"Value": val, "WFSerializationType": "WFTextTokenString"}


def champ(cle, valeur, sorte=0):  # sorte 0 = texte, 5 = fichier
    item = {"WFItemType": sorte, "WFKey": texte(cle)}
    item["WFValue"] = valeur
    return item


def dico(items): return {"Value": {"WFDictionaryFieldValueItems": items}, "WFSerializationType": "WFDictionaryFieldValue"}


ENTREE = {"Type": "ExtensionInput"}


def var(nom): return {"Type": "Variable", "VariableName": nom}


def action(ident, **p): return {"WFWorkflowActionIdentifier": f"is.workflow.actions.{ident}", "WFWorkflowActionParameters": p}


def definir(nom, valeur): return action("setvariable", WFVariableName=nom, WFInput=jeton(valeur))


def si(groupe, mode, **cond): return action("conditional", GroupingIdentifier=groupe, WFControlFlowMode=mode, **cond)


u_cle, u_note, u_saisie, u_menu_fin, u_type, u_liste, u_data, u_choix, u_joint, u_rep1, u_rep2, u_rep3, u_ok = (uid() for _ in range(13))
g_entree, g_menu, g_si, g_si2, g_ok = (uid() for _ in range(5))
cle = sortie("Texte", u_cle)
auth = lambda: dico([champ("Authorization", texte("Bearer ", cle))])
API = BASE + "/api/v1/captures"
CHAMPS_TEXTE = lambda: [champ("note", texte("", var("Note"))), champ("projects", texte("", var("Projets"))), champ("ai_analysis", texte("", var("IA")))]


def envoi(u, corps):
    p = {"UUID": u, "WFURL": API, "WFHTTPMethod": "POST", "ShowHeaders": True, "WFHTTPHeaders": auth()}
    p.update(corps)
    return {"WFWorkflowActionIdentifier": "is.workflow.actions.downloadurl", "WFWorkflowActionParameters": p}


actions = [
    # 0 : la clé, remplie par la question d'import (jamais écrite dans le fichier)
    action("gettext", UUID=u_cle, WFTextActionText=""),
    # 1) Partagé depuis une app : on garde le contenu et on demande une note. Lancé depuis l'écran d'accueil : zone de texte.
    si(g_entree, 0, WFCondition=100, WFInput={"Type": "Variable", "Variable": jeton(ENTREE)}),
    definir("Contenu", ENTREE),
    action("ask", UUID=u_note, WFAskActionPrompt="Une note ? (facultatif)", WFInputType="Text", WFAskActionDefaultAnswer=" ", WFAllowsMultilineText=True),
    definir("Note", sortie("Entrée fournie", u_note)),
    si(g_entree, 1),
    action("ask", UUID=u_saisie, WFAskActionPrompt="Écris ou colle ce que tu veux envoyer à Flow", WFInputType="Text", WFAllowsMultilineText=True),
    definir("Contenu", sortie("Entrée fournie", u_saisie)),
    action("gettext", UUID=(u_vide := uid()), WFTextActionText=" "),
    definir("Note", sortie("Texte", u_vide)),
    si(g_entree, 2),
    # 2) Projets : liste lue dans Flow (projet en cours d'abord), plusieurs choix possibles
    action("downloadurl", UUID=u_liste, WFURL=API + "/projects", WFHTTPMethod="GET", ShowHeaders=True, WFHTTPHeaders=auth()),
    action("getvalueforkey", UUID=u_data, WFInput=jeton(sortie("Contenu de l'URL", u_liste)), WFDictionaryKey="data", WFGetDictionaryValueType="Value"),
    action("choosefromlist", UUID=u_choix, WFInput=jeton(sortie("Valeur du dictionnaire", u_data)), WFChooseFromListActionPrompt="Pour quel(s) projet(s) ?", WFChooseFromListActionSelectMultiple=True),
    # la liste cochée est mise telle quelle dans un champ texte : Raccourcis la convertit en une ligne par projet
    definir("Projets", sortie("Élément choisi", u_choix)),
    # 3) Analyse par l'IA ?
    action("choosefrommenu", GroupingIdentifier=g_menu, WFControlFlowMode=0, WFMenuPrompt="Analyse par l'IA ?", WFMenuItems=["Oui", "Non"]),
    action("choosefrommenu", GroupingIdentifier=g_menu, WFControlFlowMode=1, WFMenuItemTitle="Oui"),
    action("gettext", UUID=uid(), WFTextActionText="true"),
    action("choosefrommenu", GroupingIdentifier=g_menu, WFControlFlowMode=1, WFMenuItemTitle="Non"),
    action("gettext", UUID=uid(), WFTextActionText="false"),
    action("choosefrommenu", GroupingIdentifier=g_menu, WFControlFlowMode=2, UUID=u_menu_fin),
    definir("IA", sortie("Résultat du menu", u_menu_fin)),
    # 4) Envoi : JSON pour un lien ou du texte, formulaire avec le fichier pour une image ou une vidéo
    action("getitemtype", UUID=u_type, WFInput=jeton(var("Contenu"))),
    si(g_si, 0, WFCondition=99, WFConditionalActionString="URL", WFInput={"Type": "Variable", "Variable": jeton(sortie("Type", u_type))}),
    envoi(u_rep1, {"WFHTTPBodyType": "JSON", "WFJSONValues": dico([champ("text", texte("", var("Contenu")))] + CHAMPS_TEXTE())}),
    definir("Reponse", sortie("Contenu de l'URL", u_rep1)),
    si(g_si, 1),
    si(g_si2, 0, WFCondition=99, WFConditionalActionString="Text", WFInput={"Type": "Variable", "Variable": jeton(sortie("Type", u_type))}),
    envoi(u_rep2, {"WFHTTPBodyType": "JSON", "WFJSONValues": dico([champ("text", texte("", var("Contenu")))] + CHAMPS_TEXTE())}),
    definir("Reponse", sortie("Contenu de l'URL", u_rep2)),
    si(g_si2, 1),
    envoi(u_rep3, {"WFHTTPBodyType": "Form", "WFFormValues": dico([champ("file", jeton(var("Contenu")), 5)] + CHAMPS_TEXTE())}),
    definir("Reponse", sortie("Contenu de l'URL", u_rep3)),
    si(g_si2, 2),
    si(g_si, 2),
    # 5) Vérification : « Envoyé » seulement si Flow a vraiment créé la capture (data.id), sinon le message d'erreur exact
    action("getvalueforkey", UUID=u_ok, WFInput=jeton(var("Reponse")), WFDictionaryKey="data.id", WFGetDictionaryValueType="Value"),
    si(g_ok, 0, WFCondition=100, WFInput={"Type": "Variable", "Variable": jeton(sortie("Valeur du dictionnaire", u_ok))}),
    action("notification", WFNotificationActionTitle="Flow", WFNotificationActionBody="Envoyé vers Flow"),
    si(g_ok, 1),
    action("alert", WFAlertActionTitle="Pas envoyé", WFAlertActionMessage=texte("Flow a répondu : ", var("Reponse")), WFAlertActionCancelButtonShown=False),
    si(g_ok, 2),
]
actions = [a for a in actions if a]
raccourci = {
    "WFWorkflowClientVersion": "2605.0.5", "WFWorkflowMinimumClientVersion": 900, "WFWorkflowMinimumClientVersionString": "900",
    "WFWorkflowIcon": {"WFWorkflowIconStartColor": 463140863, "WFWorkflowIconGlyphNumber": 59511},
    "WFWorkflowTypes": ["ActionExtension"], "WFWorkflowHasShortcutInputVariables": True,
    "WFWorkflowInputContentItemClasses": ["WFURLContentItem", "WFStringContentItem", "WFImageContentItem", "WFAVAssetContentItem", "WFGenericFileContentItem"],
    "WFWorkflowImportQuestions": [{"ActionIndex": 0, "Category": "Parameter", "ParameterKey": "WFTextActionText", "DefaultValue": "",
                                   "Text": "Colle ta clé Flow (créée et copiée par le bouton « Créer ma clé » dans Flow, elle commence par flw_)"}],
    "WFWorkflowActions": actions, "WFQuickActionSurfaces": [],
}

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with tempfile.TemporaryDirectory() as d:
    brut = os.path.join(d, "Flow.shortcut")
    with open(brut, "wb") as f: plistlib.dump(raccourci, f, fmt=plistlib.FMT_BINARY)
    r = subprocess.run(["shortcuts", "sign", "--mode", "anyone", "--input", brut, "--output", OUT], capture_output=True, text=True)
    if r.returncode or not os.path.exists(OUT): sys.exit("Signature impossible : " + (r.stderr or r.stdout).strip())
print(OUT, os.path.getsize(OUT), "octets")
