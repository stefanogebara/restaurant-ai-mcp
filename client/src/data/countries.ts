/**
 * Countries Data for Restaurant Onboarding
 * Only includes countries where we have AI voice support
 * Organized by language groups with major cities
 */

export interface City {
  name: string;
  region?: string; // Optional region/state for disambiguation
}

export interface Country {
  code: string; // ISO 3166-1 alpha-2
  name: string;
  language: string; // Voice language code
  flag: string; // Emoji flag
  cities: City[];
}

export interface LanguageGroup {
  language: string;
  displayName: string;
  flag: string;
  countries: Country[];
}

// Spanish-speaking countries
const spanishCountries: Country[] = [
  {
    code: 'ES',
    name: 'Spain',
    language: 'es-ES',
    flag: '🇪🇸',
    cities: [
      { name: 'Madrid', region: 'Community of Madrid' },
      { name: 'Barcelona', region: 'Catalonia' },
      { name: 'Valencia', region: 'Valencian Community' },
      { name: 'Seville', region: 'Andalusia' },
      { name: 'Zaragoza', region: 'Aragon' },
      { name: 'Málaga', region: 'Andalusia' },
      { name: 'Murcia', region: 'Region of Murcia' },
      { name: 'Palma', region: 'Balearic Islands' },
      { name: 'Bilbao', region: 'Basque Country' },
      { name: 'Alicante', region: 'Valencian Community' },
      { name: 'Granada', region: 'Andalusia' },
      { name: 'San Sebastián', region: 'Basque Country' },
    ],
  },
  {
    code: 'MX',
    name: 'Mexico',
    language: 'es-MX',
    flag: '🇲🇽',
    cities: [
      { name: 'Mexico City', region: 'Federal District' },
      { name: 'Guadalajara', region: 'Jalisco' },
      { name: 'Monterrey', region: 'Nuevo León' },
      { name: 'Puebla', region: 'Puebla' },
      { name: 'Tijuana', region: 'Baja California' },
      { name: 'Cancún', region: 'Quintana Roo' },
      { name: 'Mérida', region: 'Yucatán' },
      { name: 'Querétaro', region: 'Querétaro' },
      { name: 'Playa del Carmen', region: 'Quintana Roo' },
      { name: 'San Miguel de Allende', region: 'Guanajuato' },
      { name: 'Oaxaca', region: 'Oaxaca' },
      { name: 'Puerto Vallarta', region: 'Jalisco' },
    ],
  },
  {
    code: 'AR',
    name: 'Argentina',
    language: 'es-AR',
    flag: '🇦🇷',
    cities: [
      { name: 'Buenos Aires', region: 'Buenos Aires' },
      { name: 'Córdoba', region: 'Córdoba' },
      { name: 'Rosario', region: 'Santa Fe' },
      { name: 'Mendoza', region: 'Mendoza' },
      { name: 'Bariloche', region: 'Río Negro' },
      { name: 'Mar del Plata', region: 'Buenos Aires' },
      { name: 'Salta', region: 'Salta' },
      { name: 'San Carlos de Bariloche', region: 'Río Negro' },
      { name: 'La Plata', region: 'Buenos Aires' },
      { name: 'Ushuaia', region: 'Tierra del Fuego' },
    ],
  },
  {
    code: 'CO',
    name: 'Colombia',
    language: 'es-CO',
    flag: '🇨🇴',
    cities: [
      { name: 'Bogotá', region: 'Cundinamarca' },
      { name: 'Medellín', region: 'Antioquia' },
      { name: 'Cali', region: 'Valle del Cauca' },
      { name: 'Cartagena', region: 'Bolívar' },
      { name: 'Barranquilla', region: 'Atlántico' },
      { name: 'Bucaramanga', region: 'Santander' },
      { name: 'Santa Marta', region: 'Magdalena' },
      { name: 'Pereira', region: 'Risaralda' },
      { name: 'Manizales', region: 'Caldas' },
      { name: 'Armenia', region: 'Quindío' },
    ],
  },
  {
    code: 'CL',
    name: 'Chile',
    language: 'es-CL',
    flag: '🇨🇱',
    cities: [
      { name: 'Santiago', region: 'Santiago Metropolitan' },
      { name: 'Valparaíso', region: 'Valparaíso' },
      { name: 'Viña del Mar', region: 'Valparaíso' },
      { name: 'Concepción', region: 'Biobío' },
      { name: 'La Serena', region: 'Coquimbo' },
      { name: 'Pucón', region: 'Araucanía' },
      { name: 'Puerto Varas', region: 'Los Lagos' },
      { name: 'San Pedro de Atacama', region: 'Antofagasta' },
      { name: 'Punta Arenas', region: 'Magallanes' },
      { name: 'Temuco', region: 'Araucanía' },
    ],
  },
  {
    code: 'PE',
    name: 'Peru',
    language: 'es-PE',
    flag: '🇵🇪',
    cities: [
      { name: 'Lima', region: 'Lima' },
      { name: 'Cusco', region: 'Cusco' },
      { name: 'Arequipa', region: 'Arequipa' },
      { name: 'Trujillo', region: 'La Libertad' },
      { name: 'Chiclayo', region: 'Lambayeque' },
      { name: 'Piura', region: 'Piura' },
      { name: 'Iquitos', region: 'Loreto' },
      { name: 'Huancayo', region: 'Junín' },
      { name: 'Puno', region: 'Puno' },
      { name: 'Tacna', region: 'Tacna' },
    ],
  },
];

// Portuguese-speaking countries
const portugueseCountries: Country[] = [
  {
    code: 'PT',
    name: 'Portugal',
    language: 'pt-PT',
    flag: '🇵🇹',
    cities: [
      { name: 'Lisbon', region: 'Lisbon' },
      { name: 'Porto', region: 'Porto' },
      { name: 'Faro', region: 'Faro' },
      { name: 'Coimbra', region: 'Coimbra' },
      { name: 'Braga', region: 'Braga' },
      { name: 'Funchal', region: 'Madeira' },
      { name: 'Évora', region: 'Évora' },
      { name: 'Albufeira', region: 'Faro' },
      { name: 'Cascais', region: 'Lisbon' },
      { name: 'Sintra', region: 'Lisbon' },
    ],
  },
  {
    code: 'BR',
    name: 'Brazil',
    language: 'pt-BR',
    flag: '🇧🇷',
    cities: [
      { name: 'São Paulo', region: 'São Paulo' },
      { name: 'Rio de Janeiro', region: 'Rio de Janeiro' },
      { name: 'Brasília', region: 'Federal District' },
      { name: 'Salvador', region: 'Bahia' },
      { name: 'Fortaleza', region: 'Ceará' },
      { name: 'Belo Horizonte', region: 'Minas Gerais' },
      { name: 'Curitiba', region: 'Paraná' },
      { name: 'Recife', region: 'Pernambuco' },
      { name: 'Porto Alegre', region: 'Rio Grande do Sul' },
      { name: 'Florianópolis', region: 'Santa Catarina' },
      { name: 'Búzios', region: 'Rio de Janeiro' },
      { name: 'Gramado', region: 'Rio Grande do Sul' },
    ],
  },
];

// French-speaking countries
const frenchCountries: Country[] = [
  {
    code: 'FR',
    name: 'France',
    language: 'fr-FR',
    flag: '🇫🇷',
    cities: [
      { name: 'Paris', region: 'Île-de-France' },
      { name: 'Lyon', region: 'Auvergne-Rhône-Alpes' },
      { name: 'Marseille', region: 'Provence-Alpes-Côte d\'Azur' },
      { name: 'Nice', region: 'Provence-Alpes-Côte d\'Azur' },
      { name: 'Bordeaux', region: 'Nouvelle-Aquitaine' },
      { name: 'Toulouse', region: 'Occitanie' },
      { name: 'Strasbourg', region: 'Grand Est' },
      { name: 'Nantes', region: 'Pays de la Loire' },
      { name: 'Cannes', region: 'Provence-Alpes-Côte d\'Azur' },
      { name: 'Monaco', region: 'Monaco' },
      { name: 'Lille', region: 'Hauts-de-France' },
      { name: 'Montpellier', region: 'Occitanie' },
    ],
  },
  {
    code: 'BE',
    name: 'Belgium',
    language: 'fr-BE',
    flag: '🇧🇪',
    cities: [
      { name: 'Brussels', region: 'Brussels-Capital' },
      { name: 'Antwerp', region: 'Flanders' },
      { name: 'Ghent', region: 'Flanders' },
      { name: 'Bruges', region: 'Flanders' },
      { name: 'Liège', region: 'Wallonia' },
      { name: 'Namur', region: 'Wallonia' },
      { name: 'Charleroi', region: 'Wallonia' },
      { name: 'Leuven', region: 'Flanders' },
    ],
  },
  {
    code: 'CH',
    name: 'Switzerland',
    language: 'fr-CH',
    flag: '🇨🇭',
    cities: [
      { name: 'Geneva', region: 'Geneva' },
      { name: 'Lausanne', region: 'Vaud' },
      { name: 'Zurich', region: 'Zurich' },
      { name: 'Bern', region: 'Bern' },
      { name: 'Basel', region: 'Basel-City' },
      { name: 'Lucerne', region: 'Lucerne' },
      { name: 'Lugano', region: 'Ticino' },
      { name: 'Montreux', region: 'Vaud' },
      { name: 'Interlaken', region: 'Bern' },
      { name: 'Zermatt', region: 'Valais' },
    ],
  },
];

// German-speaking countries
const germanCountries: Country[] = [
  {
    code: 'DE',
    name: 'Germany',
    language: 'de-DE',
    flag: '🇩🇪',
    cities: [
      { name: 'Berlin', region: 'Berlin' },
      { name: 'Munich', region: 'Bavaria' },
      { name: 'Hamburg', region: 'Hamburg' },
      { name: 'Frankfurt', region: 'Hesse' },
      { name: 'Cologne', region: 'North Rhine-Westphalia' },
      { name: 'Stuttgart', region: 'Baden-Württemberg' },
      { name: 'Düsseldorf', region: 'North Rhine-Westphalia' },
      { name: 'Dresden', region: 'Saxony' },
      { name: 'Leipzig', region: 'Saxony' },
      { name: 'Nuremberg', region: 'Bavaria' },
      { name: 'Heidelberg', region: 'Baden-Württemberg' },
      { name: 'Freiburg', region: 'Baden-Württemberg' },
    ],
  },
  {
    code: 'AT',
    name: 'Austria',
    language: 'de-AT',
    flag: '🇦🇹',
    cities: [
      { name: 'Vienna', region: 'Vienna' },
      { name: 'Salzburg', region: 'Salzburg' },
      { name: 'Innsbruck', region: 'Tyrol' },
      { name: 'Graz', region: 'Styria' },
      { name: 'Linz', region: 'Upper Austria' },
      { name: 'Hallstatt', region: 'Upper Austria' },
      { name: 'Klagenfurt', region: 'Carinthia' },
      { name: 'Bregenz', region: 'Vorarlberg' },
    ],
  },
];

// English-speaking countries
const englishCountries: Country[] = [
  {
    code: 'US',
    name: 'United States',
    language: 'en-US',
    flag: '🇺🇸',
    cities: [
      { name: 'New York', region: 'New York' },
      { name: 'Los Angeles', region: 'California' },
      { name: 'Chicago', region: 'Illinois' },
      { name: 'San Francisco', region: 'California' },
      { name: 'Miami', region: 'Florida' },
      { name: 'Las Vegas', region: 'Nevada' },
      { name: 'Seattle', region: 'Washington' },
      { name: 'Boston', region: 'Massachusetts' },
      { name: 'Austin', region: 'Texas' },
      { name: 'Denver', region: 'Colorado' },
      { name: 'Portland', region: 'Oregon' },
      { name: 'Nashville', region: 'Tennessee' },
      { name: 'New Orleans', region: 'Louisiana' },
      { name: 'San Diego', region: 'California' },
    ],
  },
  {
    code: 'GB',
    name: 'United Kingdom',
    language: 'en-GB',
    flag: '🇬🇧',
    cities: [
      { name: 'London', region: 'England' },
      { name: 'Manchester', region: 'England' },
      { name: 'Edinburgh', region: 'Scotland' },
      { name: 'Birmingham', region: 'England' },
      { name: 'Liverpool', region: 'England' },
      { name: 'Bristol', region: 'England' },
      { name: 'Glasgow', region: 'Scotland' },
      { name: 'Oxford', region: 'England' },
      { name: 'Cambridge', region: 'England' },
      { name: 'Brighton', region: 'England' },
      { name: 'Cardiff', region: 'Wales' },
      { name: 'Bath', region: 'England' },
    ],
  },
  {
    code: 'CA',
    name: 'Canada',
    language: 'en-CA',
    flag: '🇨🇦',
    cities: [
      { name: 'Toronto', region: 'Ontario' },
      { name: 'Vancouver', region: 'British Columbia' },
      { name: 'Montreal', region: 'Quebec' },
      { name: 'Calgary', region: 'Alberta' },
      { name: 'Ottawa', region: 'Ontario' },
      { name: 'Edmonton', region: 'Alberta' },
      { name: 'Quebec City', region: 'Quebec' },
      { name: 'Winnipeg', region: 'Manitoba' },
      { name: 'Victoria', region: 'British Columbia' },
      { name: 'Halifax', region: 'Nova Scotia' },
    ],
  },
  {
    code: 'AU',
    name: 'Australia',
    language: 'en-AU',
    flag: '🇦🇺',
    cities: [
      { name: 'Sydney', region: 'New South Wales' },
      { name: 'Melbourne', region: 'Victoria' },
      { name: 'Brisbane', region: 'Queensland' },
      { name: 'Perth', region: 'Western Australia' },
      { name: 'Adelaide', region: 'South Australia' },
      { name: 'Gold Coast', region: 'Queensland' },
      { name: 'Canberra', region: 'Australian Capital Territory' },
      { name: 'Hobart', region: 'Tasmania' },
      { name: 'Cairns', region: 'Queensland' },
      { name: 'Darwin', region: 'Northern Territory' },
    ],
  },
];

// Italian-speaking countries
const italianCountries: Country[] = [
  {
    code: 'IT',
    name: 'Italy',
    language: 'it-IT',
    flag: '🇮🇹',
    cities: [
      { name: 'Rome', region: 'Lazio' },
      { name: 'Milan', region: 'Lombardy' },
      { name: 'Florence', region: 'Tuscany' },
      { name: 'Venice', region: 'Veneto' },
      { name: 'Naples', region: 'Campania' },
      { name: 'Turin', region: 'Piedmont' },
      { name: 'Bologna', region: 'Emilia-Romagna' },
      { name: 'Verona', region: 'Veneto' },
      { name: 'Genoa', region: 'Liguria' },
      { name: 'Palermo', region: 'Sicily' },
      { name: 'Siena', region: 'Tuscany' },
      { name: 'Pisa', region: 'Tuscany' },
      { name: 'Lake Como', region: 'Lombardy' },
      { name: 'Amalfi', region: 'Campania' },
    ],
  },
];

// Language groups for UI organization
export const LANGUAGE_GROUPS: LanguageGroup[] = [
  {
    language: 'spanish',
    displayName: 'Spanish',
    flag: '🇪🇸',
    countries: spanishCountries,
  },
  {
    language: 'portuguese',
    displayName: 'Portuguese',
    flag: '🇵🇹',
    countries: portugueseCountries,
  },
  {
    language: 'french',
    displayName: 'French',
    flag: '🇫🇷',
    countries: frenchCountries,
  },
  {
    language: 'german',
    displayName: 'German',
    flag: '🇩🇪',
    countries: germanCountries,
  },
  {
    language: 'english',
    displayName: 'English',
    flag: '🇬🇧',
    countries: englishCountries,
  },
  {
    language: 'italian',
    displayName: 'Italian',
    flag: '🇮🇹',
    countries: italianCountries,
  },
];

// Utility functions
export const getAllCountries = (): Country[] => {
  return LANGUAGE_GROUPS.flatMap(group => group.countries);
};

export const getCountryByCode = (code: string): Country | undefined => {
  return getAllCountries().find(country => country.code === code);
};

export const getCitiesByCountryCode = (code: string): City[] => {
  const country = getCountryByCode(code);
  return country?.cities || [];
};

export const getLanguageByCountryCode = (code: string): string | undefined => {
  const country = getCountryByCode(code);
  return country?.language;
};

export const searchCountries = (query: string): Country[] => {
  const lowerQuery = query.toLowerCase();
  return getAllCountries().filter(country =>
    country.name.toLowerCase().includes(lowerQuery)
  );
};

export const searchCities = (query: string, countryCode?: string): City[] => {
  const lowerQuery = query.toLowerCase();
  const countries = countryCode
    ? [getCountryByCode(countryCode)].filter(Boolean) as Country[]
    : getAllCountries();

  return countries
    .flatMap(country => country.cities)
    .filter(city => city.name.toLowerCase().includes(lowerQuery));
};
