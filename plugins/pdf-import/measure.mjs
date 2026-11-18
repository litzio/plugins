import { extract } from "./extract.mjs";
import { convert } from "./rules.mjs";
const r = convert(await extract(process.argv[2]));
console.log(JSON.stringify({ profile: r.profile, ...r.stats }));
