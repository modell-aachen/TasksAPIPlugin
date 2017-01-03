<template>
<div v-if="taskToEdit">
    {{taskToEdit.fields.Title.value}}
    <input v-model="taskToEdit.fields.Title.value" type="text" name="Title">
    <button v-on:click="createTask">Save</button>
</div>
</template>

<script>
import TaskPanelMixin from "../../../mixins/TaskPanelMixin.vue";
import _ from 'lodash';
export default {
    data(){
        return {
            taskToEdit: null
        };
    },
    mixins: [TaskPanelMixin],
    methods: {
        createTask(){
            let request = {
                form: this.taskToEdit.form
            };
            for(let key in this.taskToEdit.fields){
                let currentField = this.taskToEdit.fields[key];
                request[key] = currentField.value;
            }
            request.AssignedTo = "AUTOGEN";
            this.$store.dispatch("createNewTask", request);
        }
    },
    created(){
        this.taskToEdit = _.cloneDeep(this.task);
    }
};
</script>

<style lang="sass">
</style>
