
// Get the language from the URL lang parameter if it exists, otherwise it will be 'en' by default
const lang = new URLSearchParams(window.location.search).get('lang') || 'en';

document.texts = {
    "You have been expelled": "You have been expelled",
    "Rules breached": "SMOWL has detected that the rules established by the academic team have been breached.",
    "Contact your manager": "If in doubt, contact your academic manager.",
    "Accept and close": "Accept and close page",
    "reason": "Reason",
    "expelled": "Expelled for already being expelled",
    "incidents": "Exceeded incidents",
    "time": "Exceeded time outside",
    "share": "Screen not Shared",
    "screens": "Multiple screens",
}   

switch (lang) {
    case 'es':
        document.texts = {
            "You have been expelled": "Has sido expulsado",
            "Rules breached": "SMOWL ha detectado que se han incumplido las normas establecidas por el equipo académico.",
            "Contact your manager": "Si tienes dudas, contacta con tu responsable académico.",
            "Accept and close": "Aceptar y cerrar página",
            "reason": "Razón",
            "expelled": "Expulsado por ya estar expulsado",
            "incidents": "Incidencias excedidas",
            "time": "Tiempo fuera excedido",
            "share": "Pantalla no compartida",
            "screens": "Múltiples pantallas",
        }
        break;
    case 'fr':
        document.texts = {
            "You have been expelled": "Vous avez été expulsé",
            "Rules breached": "SMOWL a détecté que les règles établies par l'équipe académique ont été enfreintes",
            "Contact your manager": "En cas de doute, contactez votre responsable académique.",
            "Accept and close": "Accepter et fermer la page",
            "reason": "Raison",
            "expelled": "Expulsé pour avoir déjà été expulsé",
            "incidents": "Incidents dépassés",
            "time": "Temps passé dehors dépassé",
            "share": "Écran non partagé",
            "screens": "Écrans multiples",
        }
        break;
    case 'it':
        document.texts = {
            "You have been expelled": "Sei stato espulso",
            "Rules breached": "SMOWL ha rilevato che le regole stabilite dal team accademico sono state violate.",
            "Contact your manager": "In caso di dubbio, contatta il tuo responsabile accademico.",
            "Accept and close": "Accetta e chiudi la pagina",
            "reason": "Ragione",
            "expelled": "Espulso per essere già stato espulso",
            "incidents": "Incidenti superati",
            "time": "Tempo fuori superato",
            "share": "Schermo non condiviso",
            "screens": "Schermi multipli",
        }
        break;
    case 'de':
        document.texts = {
            "You have been expelled": "Sie wurden ausgeschlossen",
            "Rules breached": "SMOWL hat festgestellt, dass die vom akademischen Team festgelegten Regeln verletzt wurden.",
            "Contact your manager": "Bei Fragen wenden Sie sich an Ihren akademischen Manager.",
            "Accept and close": "Akzeptieren und Seite schließen",
            "reason": "Grund",
            "expelled": "Ausgeschlossen, weil bereits ausgeschlossen",
            "incidents": "Überschrittene Vorfälle",
            "time": "Überschrittene Zeit draußen",
            "share": "Bildschirm nicht geteilt",
            "screens": "Mehrere Bildschirme",
        }
        break;
    case 'pt':
        document.texts = {
            "You have been expelled": "Você foi expulso",
            "Rules breached": "A SMOWL detectou que as regras estabelecidas pela equipe acadêmica foram violadas.",
            "Contact your manager": "Em caso de dúvida, entre em contato com o seu gerente acadêmico.",
            "Accept and close": "Aceitar e fechar página",
            "reason": "Razão",
            "expelled": "Expulso por já estar expulso",
            "incidents": "Incidentes excedidos",
            "time": "Tempo fora excedido",
            "share": "Tela não compartilhada",
            "screens": "Múltiplas telas",
        }
        break;
    case 'fi':
        document.texts = {
            "You have been expelled": "Olet erotettu",
            "Rules breached": "SMOWL on havainnut, että akateemisen tiimin asettamia sääntöjä on rikottu.",
            "Contact your manager": "Jos olet epävarma, ota yhteyttä akateemiseen esimieheesi.",
            "Accept and close": "Hyväksy ja sulje sivu",
            "reason": "Syy",
            "expelled": "Erotettu, koska oli jo erotettu",
            "incidents": "Tapahtumat ylitetty",
            "time": "Ulkonaoloaika ylitetty",
            "share": "Näyttöä ei jaettu",
            "screens": "Useita näyttöjä",
        }
        break;
    case 'ca':
        document.texts = {
            "You have been expelled": "Has estat expulsat",
            "Rules breached": "SMOWL ha detectat que s'han incomplert les normes establertes per l'equip acadèmic.",
            "Contact your manager": "Si tens dubtes, contacta amb el teu responsable acadèmic.",
            "Accept and close": "Accepta i tanca la pàgina",
            "reason": "Raó",
            "expelled": "Expulsat per ja estar expulsat",
            "incidents": "Incidents excedits",
            "time": "Temps fora excedit",
            "share": "Pantalla no compartida",
            "screens": "Múltiples pantalles",
        }
        break;
    case 'af':
        document.texts = {
            "You have been expelled": "Jy is uitgesluit",
            "Rules breached": "SMOWL het vasgestel dat die reels wat deur die akademiese span vasgestel is, oortree is.",
            "Contact your manager": "Indien daar onsekerheid is, kontak u akademiese bestuurder.",
            "Accept and close": "Aanvaar en sluit bladsy",
            "reason": "Rede",
            "expelled": "Verwyder vir reeds verwyder wees",
            "incidents": "Voorvalle oorskry",
            "time": "Tyd buite oorskry",
            "share": "Skerm nie gedeel nie",
            "screens": "Veelvuldige skerms",
        }
        break;
    case 'zu':
        document.texts = {
            "You have been expelled": "Uyakwaziwa",
            "Rules breached": "SMOWL ihlola ukuthi izinqumo ezithintwe ngumkhakha wasekhuluma zingathintwa.",
            "Contact your manager": "Uma kukhona okungahambi, thintana nomqondisi wakho wasekhuluma.",
            "Accept and close": "Vuma futhi vala ikhasi",
            "reason": "Isizathu",
            "expelled": "Xoshiwe ngenxa yokuxoshwa kakade",
            "incidents": "Izehlakalo ezidlulile",
            "time": "Isikhathi sangaphandle sidluliwe",
            "share": "Isikrini asabelwanga",
            "screens": "Izikrini eziningi",
        }
        break;
}

