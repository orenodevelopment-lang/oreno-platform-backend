import{Router}from'express';import{asyncHandler}from'../../common/http/async-handler.js';import{authenticate}from'../auth/index.js';import{search}from'./search.controller.js';export function createSearchRouter(){const r=Router();r.get('/',authenticate(),asyncHandler(search));return r;}

