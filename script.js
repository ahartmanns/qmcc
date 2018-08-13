// View model
var qmcc = {};
qmcc.params = [];
qmcc.modelTypes = [ "CTMC", "DTMC", "MA", "MDP", "PTA" ];
qmcc.models = ko.observableArray();
qmcc.filter = {
	name: ko.observable(""),
	type: ko.observable(undefined),
	minStates: ko.observable(""),
	maxStates: ko.observable("")
};
qmcc.sortBy = ko.observable("");
qmcc.sortAsc = ko.observable(true);
qmcc.filteredModels = ko.computed(function()
{
	return this.models().filter(m =>
		(m.name.toLowerCase().includes(this.filter.name().toLowerCase()) || m.short.toLowerCase().includes(this.filter.name().toLowerCase())) // name (via .name and .short)
		&& (this.filter.type() === undefined || m.type === this.filter.type().toLowerCase()) // model type
		&& (this.filter.minStates() === "" || isNaN(Number(this.filter.minStates())) || m.maxStates >= Number(this.filter.minStates())) // min. number of states
		&& (this.filter.maxStates() === "" || isNaN(Number(this.filter.maxStates())) || m.minStates <= Number(this.filter.maxStates())) // max. number of states
	);
}, qmcc);
qmcc.selectedModel = ko.observable(null);
qmcc.select = function(model)
{
	loadResults(model);
	qmcc.selectedModel(model);
	history.replaceState(null, document.title, "#" + model.short.toLowerCase());
	setTimeout(function() { document.getElementById("modelDiv").scrollIntoView(); }, 0);
};
qmcc.close = function()
{
	history.replaceState(null, document.title, location.pathname + location.search);
	qmcc.selectedModel(null);
}

// Functions
function loadJson(path, callback)
{
	fetch(path).then(response => response.text()).then(text =>
	{
		var json = "";
		try
		{
			json = JSON.parse(text);
		}
		catch(e)
		{
			alert(path + ": " + e);
		}
		callback(json);
	});
}
function init()
{
	var queryString = window.location.href.split("?");
	if(queryString.length > 1) for(var param of queryString[1].split("&"))
	{
		var split = param.split("=");
		qmcc.params.push({ name: split[0], value: split.length > 1 ? split[1] : true });
	}
	ko.applyBindings(qmcc);
	var modelCount = -1;
	loadJson("index.json", index =>
	{
		modelCount = index.length;
		index.forEach(mr => loadJson(mr.path + "/index.json", model =>
		{
			model.path = mr.path;
			if(model.references === undefined) model.references = [];
			if(model.parameters === undefined) model.parameters = [];
			if(model.results === undefined) model.results = [];
			model.loadedResults = ko.observableArray();
			model.minStates = getStateCount(model.files, Math.min, Number.MAX_SAFE_INTEGER);
			model.maxStates = getStateCount(model.files, Math.max, 0);
			model.author = separatePersonRef(model.author);
			model.submitter = separatePersonRef(model.submitter);
			if(model.notes === undefined) model.notes = "";
			if(model.challenge !== undefined) model.notes += model.challenge;
			if(model.files !== undefined)
			{
				for(var i = 0; i < model.files.length; ++i)
				{
					if(model.files[i]["original-file"] !== undefined)
					{
						if(typeof model.files[i]["original-file"] === "string") model.files[i].originals = [ model.files[i]["original-file"] ];
						else model.files[i].originals = model.files[i]["original-file"];
					}
				}
			}
			qmcc.models.push(model);
			if(qmcc.models().length === modelCount) onEndInit();
		}));
	});
}
function onEndInit()
{
	sortModels("short");
	if(window.location.hash !== "")
	{
		// Show the model whose short name was specified in the URL's #hash
		for(var i = 0; i < qmcc.models().length; ++i)
		{
			if(qmcc.models()[i].short.toLowerCase() === window.location.hash.substr(1))
			{
				qmcc.select(qmcc.models()[i]);
				break;
			}
		}
		if(qmcc.selectedModel() === null) history.replaceState(null, document.title, location.pathname + location.search);
	}
}
function toggleShowResultDetails(result)
{
	result.showDetails(!result.showDetails());
}
function loadResults(model)
{
	if(model.results === undefined) return; // results have already been loaded
	var modelResults = model.results;
	model.results = undefined;
	modelResults.forEach(mr => loadJson(model.path + "/" + mr, result =>
	{
		result.model = model;
		result.path = model.path + "/" + mr;
		result.path = result.path.substr(0, result.path.lastIndexOf("/"));
		result.showDetails = ko.observable(false);
		result.submitter = separatePersonRef(result.submitter);
		model.loadedResults.push(result);
	}));
}
function sortModels(sortBy)
{
	var sortAsc = true;
	var sortFun = null;
	if(sortBy === "short") sortFun = (left, right) => (sortAsc ? 1 : -1) * (left.short == right.short ? 0 : (left.short < right.short ? -1 : 1));
	else if(sortBy === "name") sortFun = (left, right) => (sortAsc ? 1 : -1) * (left.name == right.name ? 0 : (left.name < right.name ? -1 : 1));
	else if(sortBy === "type") sortFun = (left, right) => (sortAsc ? 1 : -1) * (left.type == right.type ? 0 : (left.type < right.type ? -1 : 1));
	else if(sortBy === "parameters") sortFun = (left, right) => (sortAsc ? 1 : -1) * (left.parameters.length - right.parameters.length);
	else if(sortBy === "states") sortFun = (left, right) => (sortAsc ? 1 : -1) * (left.minStates - right.minStates === 0 ? left.maxStates - right.maxStates : left.minStates - right.minStates);
	else if(sortBy === "properties") sortFun = (left, right) => (sortAsc ? 1 : -1) * (left.properties.length - right.properties.length);
	else if(sortBy === "notes") sortFun = (left, right) => (sortAsc ? 1 : -1) * (left.notes == right.notes ? 0 : (left.notes < right.notes ? -1 : 1));
	else return; // should not happen
	if(qmcc.sortBy() === sortBy) qmcc.sortAsc(!qmcc.sortAsc());
	else qmcc.sortAsc(true);
	sortAsc = qmcc.sortAsc();
	qmcc.sortBy(sortBy);
	qmcc.models.sort(sortFun);
}
function propertiesToShortList(properties)
{
	var list = "";
	var props = properties.filter(p => p.type === "prob-reach");
	if(props.length !== 0) list += ", " + props.length.toLocaleString() + " × P";
	props = properties.filter(p => p.type === "prob-reach-step-bounded" || p.type === "prob-reach-time-bounded" || p.type === "prob-reach-reward-bounded");
	if(props.length !== 0) list += ", " + props.length.toLocaleString() + " × Pb";
	props = properties.filter(p => p.type === "exp-steps" || p.type === "exp-time" || p.type === "exp-reward");
	if(props.length !== 0) list += ", " + props.length.toLocaleString() + " × E";
	props = properties.filter(p => p.type === "exp-steps-step-bounded" || p.type === "exp-steps-time-bounded" || p.type === "exp-steps-reward-bounded"
		|| p.type === "exp-time-step-bounded" || p.type === "exp-time-time-bounded" || p.type === "exp-time-reward-bounded"
		|| p.type === "exp-reward-step-bounded" || p.type === "exp-reward-time-bounded" || p.type === "exp-reward-reward-bounded");
	if(props.length !== 0) list += ", " + props.length.toLocaleString() + " × Eb";
	return list.length === 0 ? list : list.substr(2);
}
function modelTypeToLongString(modelType)
{
	if(modelType === "ctmc") return "continuous-time Markov chain";
	else if(modelType === "dtmc") return "discrete-time Markov chain";
	else if(modelType === "ma") return "Markov automaton";
	else if(modelType === "mdp") return "Markov decision process";
	else if(modelType === "pta") return "probabilistic timed automaton";
	else return modelType;
}
function propertyTypeToLongString(propertyType)
{
	if(propertyType === "prob-reach") return "probabilistic reachability";
	else if(propertyType === "prob-reach-step-bounded") return "step-bounded probabilistic reachability";
	else if(propertyType === "prob-reach-time-bounded") return "time-bounded probabilistic reachability";
	else if(propertyType === "prob-reach-reward-bounded") return "reward-bounded probabilistic reachability";
	else if(propertyType === "exp-steps") return "expected accumulated number of steps";
	else if(propertyType === "exp-steps-step-bounded") return "step-bounded expected number of steps";
	else if(propertyType === "exp-steps-time-bounded") return "time-bounded expected number of steps";
	else if(propertyType === "exp-steps-reward-bounded") return "reward-bounded expected number of steps";
	else if(propertyType === "exp-time") return "expected accumulated time";
	else if(propertyType === "exp-time-step-bounded") return "step-bounded expected time";
	else if(propertyType === "exp-time-time-bounded") return "time-bounded expected time";
	else if(propertyType === "exp-time-reward-bounded") return "reward-bounded expected time";
	else if(propertyType === "exp-reward") return "expected accumulated reward";
	else if(propertyType === "exp-reward-step-bounded") return "step-bounded expected accumulated reward";
	else if(propertyType === "exp-reward-time-bounded") return "time-bounded expected accumulated reward";
	else if(propertyType === "exp-reward-reward-bounded") return "reward-bounded expected accumulated reward";
	else return propertyType;
}
function propertyTypeToShortString(propertyType)
{
	if(propertyType === "prob-reach") return "P";
	else if(propertyType === "prob-reach-step-bounded") return "Pb";
	else if(propertyType === "prob-reach-time-bounded") return "Pb";
	else if(propertyType === "prob-reach-reward-bounded") return "Pb";
	else if(propertyType === "exp-steps") return "E";
	else if(propertyType === "exp-steps-step-bounded") return "Eb";
	else if(propertyType === "exp-steps-time-bounded") return "Eb";
	else if(propertyType === "exp-steps-reward-bounded") return "Eb";
	else if(propertyType === "exp-time") return "E";
	else if(propertyType === "exp-time-step-bounded") return "Eb";
	else if(propertyType === "exp-time-time-bounded") return "Eb";
	else if(propertyType === "exp-time-reward-bounded") return "Eb";
	else if(propertyType === "exp-reward") return "E";
	else if(propertyType === "exp-reward-step-bounded") return "Eb";
	else if(propertyType === "exp-reward-time-bounded") return "Eb";
	else if(propertyType === "exp-reward-reward-bounded") return "Eb";
	else return propertyType;
}
function getStateCount(files, op, states)
{
	var result = states;
	for(var i = 0; i < files.length; ++i)
	{
		var openParamValues = files[i]["open-parameter-values"];
		if(openParamValues.length === 0) result = op(result, Number.POSITIVE_INFINITY); // no states for certain parameter configuration = too large to find out
		else
		{
			for(var j = 0; j < openParamValues.length; ++j)
			{
				if(openParamValues[j].states !== undefined)
				{
					result = op(result, op(...openParamValues[j].states.map(s => s.number !== undefined ? s.number : s.order !== undefined ? Math.pow(10, s.order) : states)));
				}
				else // no states for certain parameter configuration = too large to find out
				{
					result = op(result, Number.POSITIVE_INFINITY);
				}
			}
		}
	}
	return result;
}
function separatePersonRef(pref)
{
	var name = pref.substr(0, pref.indexOf(" <"));
	var email = pref.substr(pref.indexOf("<") + 1, pref.length - pref.indexOf("<") - 2);
	return { "name": name, "email": email };
}
function getLinkTitle(url)
{
	if(url.length > 16 && url.substr(0, 16) === "https://doi.org/") return "DOI " + url.substr(16);
	else if(url.length > 8 && url.substr(0, 8) === "https://") return url.substr(8);
	else if(url.length > 7 && url.substr(0, 7) === "http://") return url.substr(7);
	else return url;
}
function formatText(text)
{
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/`/g, "<span class=\"tt\">")
		.replace(/´/g, "</span>");
}
function toVersionFileName(file, version)
{
	return file.substr(0, file.lastIndexOf(".")) + ".v" + version.toString() + file.substr(file.lastIndexOf("."));
}
function stateCountToHtmlString(count)
{
	return count >= 1000000 && Number.isInteger(Math.log10(count)) ? "~ 10<sup>" + Math.log10(count).toString() + "</sup>" : numberToOrderString(count);
}
function numberToOrderString(number)
{
	if(number < 1000) return number.toLocaleString();
	else if(number < 10000) return (number / 1000).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " k";
	else if(number < 100000) return (number / 1000).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " k";
	else if(number < 1000000) return (number / 1000).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " k";
	else if(number < 10000000) return (number / 1000000).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " M";
	else if(number < 100000000) return (number / 1000000).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " M";
	else if(number < 1000000000) return (number / 1000000).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " M";
	else if(number < 10000000000) return (number / 1000000000).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " G";
	else if(number < 100000000000) return (number / 1000000000).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " G";
	else if(number < 1000000000000) return (number / 1000000000).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " G";
	else if(number < 10000000000000) return (number / 1000000000000).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " T";
	else if(number < 100000000000000) return (number / 1000000000000).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " T";
	else return (number / 1000000000000).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " T";
}
function CapitaliseFirst(str)
{
	return str.length === 0 ? str : str.charAt(0).toUpperCase() + str.slice(1)
}
function WriteMailLink(addr, text)
{
	document.write("<a href=\"");
	for(i = addr.length - 2; i >= 0; i--)
	{
		document.write(addr.substr(i, 1));
	}
	document.write(addr.substr(addr.length - 1, 1));
	document.write("\">");
	if(text.length == 0)
	{
		for(i = addr.length - 2; i >= 0; i--)
		{
			document.write(addr.substr(i, 1));
		}
		document.write(addr.substr(addr.length - 1, 1));
	}
	else
	{
		for(i = text.length - 2; i >= 0; i--)
		{
			document.write(text.substr(i, 1));
		}
		document.write(text.substr(text.length - 1, 1));
	}
	document.write("</a>");
}