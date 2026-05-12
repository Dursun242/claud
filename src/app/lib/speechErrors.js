// Mapping des codes d'erreur de l'API Web Speech (SpeechRecognition) vers
// des messages FR utilisateur. Renvoie null pour les codes silencieux
// (arrêt volontaire, ou code absent).
export function speechRecognitionErrorMessage(code) {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return "Micro bloqué par le navigateur — autorise l'accès dans les réglages"
    case 'audio-capture':
      return "Aucun micro détecté. Vérifie qu'un micro est branché et sélectionné dans les paramètres système."
    case 'network':
      return "Service de reconnaissance vocale injoignable. Vérifie ta connexion internet (ou utilise un autre réseau / ton téléphone)."
    case 'no-speech':
      return "Aucun son détecté. Vérifie que ton micro fonctionne et n'est pas muté."
    case 'aborted':
      return null
    default:
      return code ? "Erreur de reconnaissance vocale : " + code : null
  }
}
