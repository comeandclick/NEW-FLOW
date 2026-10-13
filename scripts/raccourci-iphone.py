#!/usr/bin/env python3
"""Fabrique et signe le raccourci iPhone « Flow » (Partager -> Flow) : public/raccourci/Flow.shortcut.
La clé API n'est PAS dans le fichier : l'app Raccourcis la demande à l'installation (question d'import), le fichier peut donc
être public. Signature : `shortcuts sign --mode anyone` (Mac connecté à iCloud), obligatoire pour l'import sur iPhone.
Ce que fait le raccourci : note facultative, question « Analyse par l'IA ? », puis POST /api/v1/captures
(JSON pour un lien ou du texte, formulaire avec le fichier pour une image ou une vidéo), puis une notification.
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
u_cle, u_note, u_menu_fin, u_type, u_si = uid(), uid(), uid(), uid(), uid()
g_menu, g_si, g_si2 = uid(), uid(), uid()
cle = {"Type": "ActionOutput", "OutputName": "Texte", "OutputUUID": u_cle}
ia = sortie("Résultat du menu", u_menu_fin)
note = sortie("Entrée fournie", u_note)


def envoi(corps):
    p = {"WFURL": BASE + "/api/v1/captures", "WFHTTPMethod": "POST", "ShowHeaders": True,
         "WFHTTPHeaders": dico([champ("Authorization", texte("Bearer ", cle))])}
    p.update(corps)
    return {"WFWorkflowActionIdentifier": "is.workflow.actions.downloadurl", "WFWorkflowActionParameters": p}


actions = [
    # 0 : la clé, remplie par la question d'import (jamais écrite dans le fichier)
    {"WFWorkflowActionIdentifier": "is.workflow.actions.gettext", "WFWorkflowActionParameters": {"UUID": u_cle, "WFTextActionText": ""}},
    {"WFWorkflowActionIdentifier": "is.workflow.actions.ask", "WFWorkflowActionParameters": {
        "UUID": u_note, "WFAskActionPrompt": "Une note ? (facultatif)", "WFInputType": "Text", "WFAskActionDefaultAnswer": " "}},
    {"WFWorkflowActionIdentifier": "is.workflow.actions.choosefrommenu", "WFWorkflowActionParameters": {
        "GroupingIdentifier": g_menu, "WFControlFlowMode": 0, "WFMenuPrompt": "Analyse par l'IA ?", "WFMenuItems": ["Oui", "Non"]}},
    {"WFWorkflowActionIdentifier": "is.workflow.actions.choosefrommenu", "WFWorkflowActionParameters": {"GroupingIdentifier": g_menu, "WFControlFlowMode": 1, "WFMenuItemTitle": "Oui"}},
    {"WFWorkflowActionIdentifier": "is.workflow.actions.gettext", "WFWorkflowActionParameters": {"UUID": uid(), "WFTextActionText": "true"}},
    {"WFWorkflowActionIdentifier": "is.workflow.actions.choosefrommenu", "WFWorkflowActionParameters": {"GroupingIdentifier": g_menu, "WFControlFlowMode": 1, "WFMenuItemTitle": "Non"}},
    {"WFWorkflowActionIdentifier": "is.workflow.actions.gettext", "WFWorkflowActionParameters": {"UUID": uid(), "WFTextActionText": "false"}},
    {"WFWorkflowActionIdentifier": "is.workflow.actions.choosefrommenu", "WFWorkflowActionParameters": {"GroupingIdentifier": g_menu, "WFControlFlowMode": 2, "UUID": u_menu_fin}},
    # type de ce qui est partagé ; « contient » marche en français et en anglais (URL, Text/Texte)
    {"WFWorkflowActionIdentifier": "is.workflow.actions.getitemtype", "WFWorkflowActionParameters": {"UUID": u_type, "WFInput": jeton(ENTREE)}},
    {"WFWorkflowActionIdentifier": "is.workflow.actions.conditional", "WFWorkflowActionParameters": {
        "GroupingIdentifier": g_si, "WFControlFlowMode": 0, "WFCondition": 99, "WFConditionalActionString": "URL", "WFInput": {"Type": "Variable", "Variable": jeton(sortie("Type", u_type))}}},
    envoi({"WFHTTPBodyType": "JSON", "WFJSONValues": dico([champ("text", texte("", ENTREE)), champ("note", texte("", note)), champ("ai_analysis", texte("", ia))])}),
    {"WFWorkflowActionIdentifier": "is.workflow.actions.conditional", "WFWorkflowActionParameters": {"GroupingIdentifier": g_si, "WFControlFlowMode": 1}},
    {"WFWorkflowActionIdentifier": "is.workflow.actions.conditional", "WFWorkflowActionParameters": {
        "GroupingIdentifier": g_si2, "WFControlFlowMode": 0, "WFCondition": 99, "WFConditionalActionString": "Text", "WFInput": {"Type": "Variable", "Variable": jeton(sortie("Type", u_type))}}},
    envoi({"WFHTTPBodyType": "JSON", "WFJSONValues": dico([champ("text", texte("", ENTREE)), champ("note", texte("", note)), champ("ai_analysis", texte("", ia))])}),
    {"WFWorkflowActionIdentifier": "is.workflow.actions.conditional", "WFWorkflowActionParameters": {"GroupingIdentifier": g_si2, "WFControlFlowMode": 1}},
    envoi({"WFHTTPBodyType": "Form", "WFFormValues": dico([champ("file", jeton(ENTREE), 5), champ("note", texte("", note)), champ("ai_analysis", texte("", ia))])}),
    {"WFWorkflowActionIdentifier": "is.workflow.actions.conditional", "WFWorkflowActionParameters": {"GroupingIdentifier": g_si2, "WFControlFlowMode": 2}},
    {"WFWorkflowActionIdentifier": "is.workflow.actions.conditional", "WFWorkflowActionParameters": {"GroupingIdentifier": g_si, "WFControlFlowMode": 2}},
    {"WFWorkflowActionIdentifier": "is.workflow.actions.notification", "WFWorkflowActionParameters": {"WFNotificationActionTitle": "Flow", "WFNotificationActionBody": "Envoyé vers Flow"}},
]

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
