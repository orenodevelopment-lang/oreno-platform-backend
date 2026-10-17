import { z } from 'zod'; import { pagePaginationSchema } from '../../common/pagination/pagination.js'; import { searchQuerySchema } from '../../common/validation/common-schemas.js';
export const globalSearchSchema=pagePaginationSchema.extend({q:searchQuerySchema,types:z.preprocess((v)=>typeof v==='string'?v.split(','):v,z.array(z.enum(['jobs','talents','staff','organisations','users'])).max(5).default(['jobs','talents','staff']))});

