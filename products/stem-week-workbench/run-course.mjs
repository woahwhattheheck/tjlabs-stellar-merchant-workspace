#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {createStemWeekCore} from './stem-week-core.mjs';
import {runStemWeekCourse} from './source-course.mjs';
const out=process.argv[2];if(!out)throw new Error('Usage: node run-course.mjs NEW_OUTPUT_DIRECTORY');
const result=runStemWeekCourse(createStemWeekCore());await fs.mkdir(out,{recursive:false});
await fs.writeFile(path.join(out,'source-course-result.json'),JSON.stringify(result,null,2),{flag:'wx'});
process.stdout.write(JSON.stringify({passed:result.passed,output:path.resolve(out)})+'\n');
