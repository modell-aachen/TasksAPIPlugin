import Vue from 'vue'
import * as types from '../mutation-types'

/* global foswiki */

const gridState = {
    tasksToShow: [],
    currentPage: 1,
    resultsPerPage: 25,
    resultCount: 10,
    sortState: {
        field: "",
        descending: false
    },
    childGridStates: [],
    isLoading: false
};

// Initial state
const INITIAL_STATE = {
    gridStates: [],
    panelState: {
        active: false,
        isLoading: false,
        view: 'detail',
        correspondingGrid: {},
        taskToShow: null,
        taskIndex: null,
        isEditMode: false,
        isNewTaskEditMode: false
    }
};

const actions = {
    fetchTasks ({commit, state}, {gridState, parentTask, depth}){
        commit(types.CHANGE_LOADING_STATE, {gridState, isLoading: true});
        let request = {
            request: JSON.stringify({
                Context: foswiki.preferences.WEB+"."+foswiki.preferences.TOPIC,
                Parent: parentTask || ''
            }),
            depth: depth || 2,
            limit: gridState.resultsPerPage,
            offset: (gridState.currentPage -1 ) * gridState.resultsPerPage,
            order: gridState.sortState.field,
            desc: gridState.sortState.descending ? "1" : "",
            noHtml: 1
        };
        $.get(foswiki.preferences.SCRIPTURLPATH + "/rest/TasksAPIPlugin/search", request, (data) => {
            commit(types.SET_TASKS_TO_SHOW, {gridState, data});
            commit(types.CHANGE_LOADING_STATE, {gridState, isLoading: false});
        }, "json");
    },
    updateTask ({commit, state}, {gridState, request}){
        if(state.panelState.active){
            commit(types.CHANGE_PANEL_LOADING_STATE, true);
        }
        else{
            commit(types.CHANGE_LOADING_STATE, {gridState, isLoading: true});
        }
        $.post(foswiki.preferences.SCRIPTURLPATH + "/rest/TasksAPIPlugin/update", request, (data) => {
            commit(types.UPDATE_TASK, {gridState, data});
            if(state.panelState.active){
                commit(types.CHANGE_PANEL_LOADING_STATE, false);
            }
            else{
                commit(types.CHANGE_LOADING_STATE, {gridState, isLoading: false});
            }
        }, "json");
    },
    changeSortState ({dispatch, commit, state}, {gridState, newSortState, parentTask}){
        commit(types.CHANGE_SORT, {gridState, newSortState});
        dispatch('fetchTasks', {gridState, parentTask});
    },
    addGridState ({commit, state}, {parentGridState, callback}){
        let newGridState = Object.assign({}, gridState);
        commit(types.ADD_GRID_STATE, {parentGridState, newGridState});
        callback(newGridState);
    },
    showTaskDetails({commit, state}, {task, gridState}) {
        commit(types.TOGGLE_PANEL_STATE);
        commit(types.SET_PANEL_TASK, {task, gridState});
        commit(types.SET_PANEL_VIEW, {view: "detail"});
    },
    openNewTaskEditor({commit, state}, {formName, gridState}){
        commit(types.TOGGLE_PANEL_STATE);
        commit(types.CHANGE_PANEL_LOADING_STATE, true);
        $.post(foswiki.preferences.SCRIPTURLPATH + "/rest/TasksAPIPlugin/create", {form:formName, Context: foswiki.preferences.WEB+"."+foswiki.preferences.TOPIC, dontsave: 1}, (data) => {
            commit(types.SET_NEW_TASK_EDITOR, {newTask: data.data, correspondingGrid: gridState});
            commit(types.CHANGE_PANEL_LOADING_STATE, false);
        }, "json");
    },
    createNewTask({commit, state}, request){
        commit(types.CHANGE_PANEL_LOADING_STATE, true);
        $.post(foswiki.preferences.SCRIPTURLPATH + "/rest/TasksAPIPlugin/create", {...request, Context: foswiki.preferences.WEB+"."+foswiki.preferences.TOPIC}, (data) => {
            let newTasksToShow = [data.data, ...state.panelState.correspondingGrid.tasksToShow];
            commit(types.SET_TASKS_TO_SHOW, {gridState: state.panelState.correspondingGrid, data: {data: newTasksToShow, total: state.panelState.correspondingGrid.resultCount}});
            commit(types.CHANGE_PANEL_LOADING_STATE, false);
            commit(types.TOGGLE_PANEL_STATE);
        }, "json");
    },
    switchEditMode({commit, state}, {enable, onLeaseTaken}){
        //Just return if there is no state switch
        if(enable == state.panelState.isEditMode)
            return;
        //Enable means: Request lease -> set edit view if lease succeeds
        if(enable){
            commit(types.CHANGE_PANEL_LOADING_STATE, true);
            $.get(foswiki.preferences.SCRIPTURLPATH + "/rest/TasksAPIPlugin/lease", {request: JSON.stringify({id: state.panelState.taskToShow.id})}, null, "json")
            .done((data) => {
                commit(types.SET_PANEL_EDIT_MODE, true);
                commit(types.SET_PANEL_VIEW, {view: "edit"});
                commit(types.CHANGE_PANEL_LOADING_STATE, false);
            })
            .fail(() => {
                commit(types.CHANGE_PANEL_LOADING_STATE, false);
                onLeaseTaken();
            });
        }
        //!enable means: Release -> set detail view
        else{
            $.get(foswiki.preferences.SCRIPTURLPATH + "/rest/TasksAPIPlugin/release", {request: JSON.stringify({id: state.panelState.taskToShow.id})}, null, "json");
            commit(types.SET_PANEL_EDIT_MODE, false);
            commit(types.SET_PANEL_VIEW, {view: "detail"});
        }
    }
}

// Mutations
const mutations = {
    [types.SET_TASKS_TO_SHOW] (state, {gridState, data}) {
        gridState.tasksToShow = data.data;
        gridState.resultCount = data.total;
    },
    [types.UPDATE_TASK] (state, {gridState, data}) {
        $.each(gridState.tasksToShow, function(key,value) {
            if(value.id === data.data.id){
                value.fields = data.data.fields;
                value.changesets = data.data.changesets;
            }
        });
    },
    [types.SET_CURRENT_PAGE] (state, {gridState, newPage}) {
        gridState.currentPage = newPage;
    },
    [types.CHANGE_LOADING_STATE] (state, {gridState, isLoading}) {
        gridState.isLoading = isLoading;
    },
    [types.CHANGE_SORT] (state, {gridState, newSortState}) {
        gridState.sortState = newSortState;
    },
    [types.ADD_GRID_STATE] (state, {parentGridState, newGridState}) {
        if(parentGridState){
            parentGridState.childGridStates.push(newGridState)
        }
        else{
            state.gridStates.push(newGridState);
        }
    },
    [types.TOGGLE_PANEL_STATE] (state) {
        state.panelState.active = !state.panelState.active;
        //Reset to initial state when the panel is opened.
        if(state.panelState.active){
            state.panelState = Object.assign({}, INITIAL_STATE.panelState);
        }
    },
    [types.SET_PANEL_TASK] (state, {task, gridState}) {
        state.panelState.taskIndex = gridState.tasksToShow.indexOf(task);
        state.panelState.correspondingGrid = gridState;
        state.panelState.taskToShow = task;
    },
    [types.SET_PANEL_NEXT_TASK] (state) {
        let taskIndex = state.panelState.taskIndex;
        let tasksToShow = state.panelState.correspondingGrid.tasksToShow;
        if(tasksToShow.length-1 !== taskIndex){
            state.panelState.taskToShow = tasksToShow[taskIndex+1];
            state.panelState.taskIndex = taskIndex + 1;
        } else {
            state.panelState.taskToShow = tasksToShow[0];
            state.panelState.taskIndex = 0;
        }
    },
    [types.SET_PANEL_PREV_TASK] (state) {
        let taskIndex = state.panelState.taskIndex;
        let tasksToShow = state.panelState.correspondingGrid.tasksToShow;
        if(0 !== taskIndex){
            state.panelState.taskToShow = tasksToShow[taskIndex - 1];
            state.panelState.taskIndex = taskIndex - 1;
        } else {
            state.panelState.taskToShow = tasksToShow[tasksToShow.length - 1];
            state.panelState.taskIndex = tasksToShow.length - 1;
        }
    },
    [types.SET_PANEL_VIEW] (state, {view}) {
        state.panelState.view = view;
    },
    [types.SET_PANEL_EDIT_MODE] (state, isEditMode) {
        state.panelState.isEditMode = isEditMode;
    },
    [types.CHANGE_PANEL_LOADING_STATE] (state, isLoading) {
        state.panelState.isLoading = isLoading;
    },
    [types.SET_NEW_TASK_EDITOR] (state, {newTask, correspondingGrid}) {
        state.panelState.taskToShow = newTask;
        state.panelState.isEditMode = true;
        state.panelState.view = "edit";
        state.panelState.isNewTaskEditMode = true;
        state.panelState.correspondingGrid = correspondingGrid;
    }
}

export default {
    state: Object.assign({}, INITIAL_STATE),
    actions,
    mutations
};
