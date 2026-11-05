// The system list. Order matters only for tick order and tab order.
// To remove a system: delete its line here (and its folder). Nothing else imports it.
import type { GameSystem } from '../core/types';
import { brood } from './brood';
import { jobs, techniques } from './jobs';
import { research, researchDone } from './research';
import { nest } from './nest';
import { expeditions } from './expeditions';
import { map } from './map';
import { war } from './war';
import { garden } from './garden';
import { castes } from './castes';
import { waters } from './waters';
import { lineage } from './lineage';
import { champion } from './champion';
import { archive } from './archive';
import { genome } from './genome';
import { husbandry } from './husbandry';
import { migration } from './migration';
import { town } from './town';
import { supercolony } from './supercolony';
import { stats } from './stats';
import { happenings } from './happenings';

export const SYSTEMS: GameSystem[] = [
  brood,
  jobs,
  techniques,
  research,
  researchDone,
  nest,
  expeditions,
  map,
  war,
  garden,
  castes,
  waters,
  lineage,
  husbandry,
  champion,
  archive,
  migration,
  town,
  supercolony,
  stats,
  genome,
  happenings,
];
